import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { headers } from 'next/headers'
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { z } from 'zod'
import {
  canModerate,
  canPublishCase,
  canRespondToBrief,
  canSelectExpertiseDistricts,
  canSubmitReview,
  hideContacts,
  canTransitionOrder,
  derivePriceRange,
  isValidScores,
  needsPremoderation,
  normalizeLeadSource,
  quotaMonthStart,
  shouldFreeze,
  shouldPromoteToTrusted,
  AUTO_CONFIRM_DAYS,
  MAX_EXPERTISE_DISTRICTS,
  SHARE_METHODS,
  SHARE_SURFACES,
  type OrderActor,
  type OrderStatus,
} from '@atelier/core'
import { prisma, Prisma, type OrderState } from '@atelier/db'
import { recalcDealStats, recalcReviewAggregate } from './aggregates'
import { notifySafe } from './notify'
import { otpGatewayEnabled, sendOtpViaGateway } from './otp-gateway'
import { getVapidPublicKey, MAX_PUSH_SUBSCRIPTIONS } from './push'
import { getProStatus, getUserPlan } from './plan'
import { track, trackSafe } from './track'
import {
  createSession,
  destroySession,
  generateOtpCode,
  getSessionUser,
  sha256,
  type SessionUser,
} from './auth'

export interface TrpcContext {
  user: SessionUser | null
}

export async function createTrpcContext(): Promise<TrpcContext> {
  return { user: await getSessionUser() }
}

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson })

const publicProcedure = t.procedure
const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Войдите, чтобы продолжить.' })
  }
  return next({ ctx: { user: ctx.user } })
})
// создание контента закрыто замороженным (3 страйка); чтение и чат по заказам остаются
const activeProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.user.frozenAt) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Аккаунт заморожен за нарушения правил. Напишите в поддержку — разберёмся.',
    })
  }
  return next()
})
// админку не раскрываем: не-модератору отвечаем как о несуществующем
const moderatorProcedure = authedProcedure.use(({ ctx, next }) => {
  if (!canModerate(ctx.user.role)) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Не найдено.' })
  }
  return next()
})

const PHONE_RE = /^\+996\d{9}$/
const OTP_TTL_MIN = 10
const OTP_MAX_PER_HOUR = 5
const OTP_MAX_ATTEMPTS = 5

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}
const slugify = (s: string) =>
  s.toLowerCase().split('').map((ch) => TRANSLIT[ch] ?? ch).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const authRouter = t.router({
  requestOtp: publicProcedure
    .input(z.object({ phone: z.string().regex(PHONE_RE, 'Номер в формате +996 XXX XXX XXX') }))
    .mutation(async ({ input }) => {
      const recent = await prisma.otpCode.count({
        where: { phone: input.phone, createdAt: { gte: new Date(Date.now() - 36e5) } },
      })
      if (recent >= OTP_MAX_PER_HOUR) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Слишком много попыток. Подождите час или напишите в поддержку.',
        })
      }
      const code = generateOtpCode()
      await prisma.otpCode.create({
        data: {
          phone: input.phone,
          codeHash: sha256(code),
          expiresAt: new Date(Date.now() + OTP_TTL_MIN * 6e4),
        },
      })

      // Боевая доставка: если настроен Telegram Gateway — шлём код через него и
      // НЕ показываем на экране. Запись НЕ удаляем при сбое: она расходует лимит
      // (иначе номера, что Gateway штатно отклоняет — без Telegram — обходили бы
      // OTP_MAX_PER_HOUR = безлимитный requestOtp + исходящий POST = self-DoS).
      // Бонус: если код всё же доставлен (таймаут после отправки) — он проверится.
      if (otpGatewayEnabled()) {
        const sent = await sendOtpViaGateway(input.phone, code, OTP_TTL_MIN * 60)
        if (!sent.ok) {
          console.error('[otp:gateway] …%s %s', input.phone.slice(-4), sent.error)
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Не удалось отправить код. Попробуйте ещё раз через минуту.',
          })
        }
        return { devCode: undefined }
      }

      // Без Gateway — код на экран: в dev — всем; в песочнице (OTP_DEV_MODE=1) —
      // ТОЛЬКО тестовым номерам сида. Гейт по VERCEL_ENV, НЕ по NODE_ENV: на Vercel
      // preview NODE_ENV=production, но песочница там нужна; на публичном Production
      // песочница ЗАПРЕЩЕНА (иначе вход модератором через засеянный тест-номер).
      const isDev = process.env.NODE_ENV !== 'production'
      const sandboxAllowed = process.env.VERCEL_ENV !== 'production'
      const isSandboxTestPhone =
        sandboxAllowed &&
        process.env.OTP_DEV_MODE === '1' &&
        /^\+9967000\d{5}$/.test(input.phone)
      if (isDev) console.log(`[otp] ${input.phone} → ${code}`)
      return { devCode: isDev || isSandboxTestPhone ? code : undefined }
    }),

  verifyOtp: publicProcedure
    .input(z.object({ phone: z.string().regex(PHONE_RE), code: z.string().length(6) }))
    .mutation(async ({ input }) => {
      const otp = await prisma.otpCode.findFirst({
        where: { phone: input.phone, consumedAt: null, expiresAt: { gte: new Date() } },
        orderBy: { createdAt: 'desc' },
      })
      if (!otp) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Код устарел — запросите новый.',
        })
      }
      // анти-brute-force: попытка списывается атомарно ДО сравнения —
      // параллельные запросы не обходят лимит гонкой
      const claimed = await prisma.otpCode.updateMany({
        where: { id: otp.id, attempts: { lt: OTP_MAX_ATTEMPTS }, consumedAt: null },
        data: { attempts: { increment: 1 } },
      })
      if (claimed.count === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Слишком много попыток — запросите новый код.',
        })
      }
      const expected = Buffer.from(otp.codeHash, 'hex')
      const actual = Buffer.from(sha256(input.code), 'hex')
      if (!timingSafeEqual(expected, actual)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Неверный код. Проверьте и попробуйте ещё раз.' })
      }
      const user = await prisma.$transaction(async (tx) => {
        await tx.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } })
        return tx.user.upsert({
          where: { phone: input.phone },
          update: { phoneVerifiedAt: new Date() },
          create: { phone: input.phone, phoneVerifiedAt: new Date(), role: 'CLIENT' },
        })
      })
      await createSession(user.id)
      await trackSafe('session_login', user.id)
      return { userId: user.id, displayName: user.displayName }
    }),

  logout: authedProcedure.mutation(async () => {
    await destroySession()
    return { ok: true }
  }),
})

// Только файлы нашего пайплайна: чужой src ронял бы next/image на всей ленте.
// dev — относительный /uploads/*.webp; prod — абсолютный URL нашего Vercel Blob-стора.
// mock/-пути разрешены вне production (демо-кнопка мастера и сид).
const UPLOAD_SRC_RE = /^\/uploads\/[a-f0-9]+\.webp$/
const BLOB_SRC_RE = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/uploads\/[a-f0-9]+\.webp$/
const MOCK_SRC_RE = /^\/mock\/[a-z0-9-]+\.jpg$/
const uploadedImage = z.object({
  storageKey: z.string().min(1).max(200),
  src: z
    .string()
    .refine(
      (s) =>
        UPLOAD_SRC_RE.test(s) ||
        BLOB_SRC_RE.test(s) ||
        (process.env.NODE_ENV !== 'production' && MOCK_SRC_RE.test(s)),
      'Фото должно быть загружено через Ателье',
    ),
  blurDataURL: z.string().startsWith('data:image/').max(4096),
  width: z.number().int().positive().max(10_000),
  height: z.number().int().positive().max(10_000),
})

const casesRouter = t.router({
  create: activeProcedure
    .input(
      z
        .object({
          kind: z.enum(['deal', 'project']),
          title: z.string().trim().min(3, 'Название — от 3 символов').max(120),
          images: z.array(uploadedImage).min(1, 'Добавьте хотя бы одно фото').max(20),
          districtName: z.string().optional(),
          consent: z.boolean(),
          // сделка
          dealType: z.enum(['sale', 'rentOut', 'buyAssist']).optional(),
          propertyType: z.string().optional(),
          price: z.number().int().positive().max(2_000_000_000).optional(),
          priceVisibility: z.enum(['exact', 'range', 'hidden']).default('range'),
          daysOnMarket: z.number().int().positive().max(999).optional(),
          // проект
          styleName: z.string().optional(),
          areaM2: z.number().positive().optional(),
        })
        .refine((v) => v.kind !== 'deal' || v.dealType, { message: 'Выберите тип сделки' })
        .refine((v) => v.consent, {
          message: 'Нужно согласие клиента на публикацию',
        }),
    )
    .mutation(async ({ ctx, input }) => {
      // ленивый профиль специалиста: первый кейс делает пользователя специалистом
      let profile = await prisma.specialistProfile.findUnique({ where: { userId: ctx.user.id } })
      if (!profile) {
        profile = await prisma.specialistProfile.create({
          data: {
            userId: ctx.user.id,
            slug: `s-${ctx.user.id.slice(-8)}`,
            specialization: input.kind === 'deal' ? 'REALTOR' : null,
            reviewAggregate: { create: {} },
          },
        })
        // роль повышаем только клиенту: модератор/админ с кейсом не теряет доступ
        if (ctx.user.role === 'CLIENT') {
          await prisma.user.update({ where: { id: ctx.user.id }, data: { role: 'SPECIALIST' } })
        }
      }

      const slugBase = slugify(input.title) || 'case'
      const slug = `${slugBase}-${randomBytes(3).toString('hex')}`

      const bishkek = await prisma.city.findUnique({ where: { slug: 'bishkek' } })
      const district = input.districtName
        ? await prisma.district.findFirst({ where: { nameRu: input.districtName } })
        : null

      const PROPERTY: Record<string, 'APARTMENT' | 'NEW_BUILD' | 'HOUSE' | 'COMMERCIAL'> = {
        Вторичка: 'APARTMENT',
        Новостройка: 'NEW_BUILD',
        Дом: 'HOUSE',
        Коммерция: 'COMMERCIAL',
      }
      const DEAL: Record<string, 'SALE' | 'RENT_OUT' | 'BUY_ASSIST'> = {
        sale: 'SALE',
        rentOut: 'RENT_OUT',
        buyAssist: 'BUY_ASSIST',
      }

      const isDeal = input.kind === 'deal'
      const exact = isDeal && input.priceVisibility === 'exact' ? input.price : undefined
      const range =
        isDeal && input.priceVisibility === 'range' && input.price
          ? derivePriceRange(input.price)
          : null

      const style = input.styleName
        ? await prisma.style.findFirst({ where: { nameRu: input.styleName } })
        : null

      // trust-tiers (решение 03/4): первые кейсы новичка — через премодерацию,
      // доверенные публикуются сразу
      // лимит тарифа — предикат публикации (Free 5; pending считаем — иначе
      // лимит обходится очередью модерации). Инвариант из core.
      const plan = await getUserPlan(ctx.user.id)
      const publishedCount = await prisma.case.count({
        where: {
          authorId: ctx.user.id,
          status: { in: ['PUBLISHED', 'PENDING_REVIEW'] },
          deletedAt: null,
        },
      })
      const planGate = canPublishCase(plan, publishedCount)
      if (!planGate.allowed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: planGate.reason })
      }

      const pending = needsPremoderation(ctx.user.trustTier)
      if (pending) {
        // новичок не заливает очередь: сначала проверка первых кейсов
        const inQueue = await prisma.case.count({
          where: { authorId: ctx.user.id, status: 'PENDING_REVIEW', deletedAt: null },
        })
        if (inQueue >= 5) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'У вас уже 5 кейсов на проверке — дождитесь модерации, потом добавите остальные.',
          })
        }
      }
      const created = await prisma.case.create({
        data: {
          authorId: ctx.user.id,
          slug,
          title: input.title,
          status: pending ? 'PENDING_REVIEW' : 'PUBLISHED',
          publishedAt: pending ? null : new Date(),
          authorRole: isDeal ? 'REALTOR_LISTING' : 'FULL_PROJECT',
          cityId: bishkek?.id,
          districtId: district?.id ?? null,
          areaM2: input.areaM2 ?? null,
          hasPublishRights: input.consent,
          dealType: isDeal ? DEAL[input.dealType!] : null,
          propertyType: isDeal ? (PROPERTY[input.propertyType ?? ''] ?? 'OTHER') : null,
          dealPriceSom: exact ?? null,
          dealPriceMinSom: range?.min ?? null,
          dealPriceMaxSom: range?.max ?? null,
          dealPriceVisibility: isDeal
            ? (input.priceVisibility.toUpperCase() as 'EXACT' | 'RANGE' | 'HIDDEN')
            : 'RANGE',
          daysOnMarket: isDeal && input.dealType !== 'buyAssist' ? (input.daysOnMarket ?? null) : null,
          styles: style ? { create: [{ styleId: style.id }] } : undefined,
          images: {
            create: input.images.map((img, i) => ({
              storageKey: img.storageKey,
              variants: { original: img.src },
              blurhash: img.blurDataURL,
              width: img.width,
              height: img.height,
              sortOrder: i,
            })),
          },
        },
        include: { images: { orderBy: { sortOrder: 'asc' } } },
      })
      await prisma.case.update({
        where: { id: created.id },
        data: { coverImageId: created.images[0]!.id },
      })
      if (pending) {
        await prisma.moderationItem.create({
          data: { entityType: 'CASE', entityId: created.id, reason: 'NEW_USER_PREMOD' },
        })
      }
      await trackSafe(pending ? 'case_pending' : 'case_published', ctx.user.id, {
        caseId: created.id,
        kind: input.kind,
      })
      return { slug: created.slug, pending }
    }),
})

const savesRouter = t.router({
  toggle: authedProcedure
    .input(z.object({ caseSlug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const target = await prisma.case.findUnique({ where: { slug: input.caseSlug } })
      if (!target || target.deletedAt || target.hiddenAt || target.status !== 'PUBLISHED') {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Кейс не найден.' })
      }
      const existing = await prisma.save.findUnique({
        where: { userId_caseId: { userId: ctx.user.id, caseId: target.id } },
      })
      if (existing) {
        await prisma.$transaction([
          prisma.save.delete({ where: { id: existing.id } }),
          prisma.case.update({ where: { id: target.id }, data: { savesCount: { decrement: 1 } } }),
        ])
        return { saved: false }
      }
      try {
        await prisma.$transaction([
          prisma.save.create({ data: { userId: ctx.user.id, caseId: target.id } }),
          prisma.case.update({ where: { id: target.id }, data: { savesCount: { increment: 1 } } }),
        ])
      } catch (e) {
        // двойной клик: параллельный toggle уже сохранил — это не ошибка
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          return { saved: true }
        }
        throw e
      }
      return { saved: true }
    }),
})

/* ============================================================================
 * M4: заявка → чат → заказ → отзыв → бейдж. Инварианты — только из @atelier/core.
 * ==========================================================================*/

/** DB enum ↔ доменные статусы core */
const ORDER_STATE_TO_CORE: Record<OrderState, OrderStatus> = {
  DISCUSSION: 'discussion',
  AGREED: 'agreed',
  IN_PROGRESS: 'in_progress',
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed',
}
const CORE_TO_ORDER_STATE = Object.fromEntries(
  Object.entries(ORDER_STATE_TO_CORE).map(([k, v]) => [v, k]),
) as Record<OrderStatus, OrderState>

async function assertParticipant(threadId: string, userId: string) {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: { participants: { include: { user: { include: { specialistProfile: true } } } } },
  })
  if (!thread || !thread.participants.some((p) => p.userId === userId)) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Диалог не найден.' })
  }
  return thread
}

const leadsRouter = t.router({
  create: activeProcedure
    .input(
      z.object({
        specialistSlug: z.string(),
        caseSlug: z.string().optional(),
        text: z.string().trim().min(10, 'Опишите задачу хотя бы парой предложений.').max(2000),
        /** сырой ?ref= первого касания — сервер нормализует в известную корзину */
        source: z.string().max(32).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await prisma.specialistProfile.findUnique({
        where: { slug: input.specialistSlug },
      })
      if (!profile || profile.deletedAt) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Специалист не найден.' })
      }
      if (profile.userId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Нельзя отправить заявку самому себе.' })
      }
      const aboutCase = input.caseSlug
        ? await prisma.case.findFirst({
            where: {
              slug: input.caseSlug,
              authorId: profile.userId,
              status: 'PUBLISHED',
              hiddenAt: null,
              deletedAt: null,
            },
          })
        : null

      // один живой диалог на пару — заявки не плодят треды
      const existing = await prisma.chatThread.findFirst({
        where: {
          AND: [
            { participants: { some: { userId: ctx.user.id } } },
            { participants: { some: { userId: profile.userId } } },
          ],
        },
        orderBy: { lastMessageAt: 'desc' },
      })
      const thread =
        existing ??
        (await prisma.chatThread.create({
          data: {
            subject: aboutCase?.title ?? 'Заявка',
            aboutCaseId: aboutCase?.id ?? null,
            participants: { create: [{ userId: ctx.user.id }, { userId: profile.userId }] },
          },
        }))
      // в переиспользованном треде контекст нового кейса — в тексте сообщения
      const text =
        existing && aboutCase ? `По кейсу «${aboutCase.title}»:\n\n${input.text}` : input.text
      await prisma.$transaction([
        prisma.message.create({
          data: { threadId: thread.id, senderId: ctx.user.id, text },
        }),
        prisma.chatThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } }),
        track(prisma, 'lead_created', ctx.user.id, {
          threadId: thread.id,
          reusedThread: Boolean(existing),
          withCase: Boolean(aboutCase),
          source: normalizeLeadSource(input.source),
        }),
      ])
      await notifySafe(profile.userId, 'lead_new', {
        title: 'Новая заявка',
        body: `${ctx.user.displayName ?? 'Клиент'}: ${input.text.slice(0, 120)}`,
        url: `/messages/${thread.id}`,
      })
      return { threadId: thread.id }
    }),
})

const chatRouter = t.router({
  messages: authedProcedure
    .input(z.object({ threadId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertParticipant(input.threadId, ctx.user.id)
      // desc+reverse: в длинном треде показываем ПОСЛЕДНИЕ 200, а не первые
      const rows = (
        await prisma.message.findMany({
          where: { threadId: input.threadId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 200,
          include: { sender: true },
        })
      ).reverse()
      await prisma.chatParticipant.updateMany({
        where: { threadId: input.threadId, userId: ctx.user.id },
        data: { lastReadAt: new Date() },
      })
      return rows.map((m) => ({
        id: m.id,
        text: m.text ?? '',
        mine: m.senderId === ctx.user.id,
        senderName: m.sender.displayName ?? 'Пользователь',
        at: m.createdAt,
      }))
    }),

  send: authedProcedure
    .input(z.object({ threadId: z.string(), text: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      await assertParticipant(input.threadId, ctx.user.id)
      const [message] = await prisma.$transaction([
        prisma.message.create({
          data: { threadId: input.threadId, senderId: ctx.user.id, text: input.text },
        }),
        prisma.chatThread.update({
          where: { id: input.threadId },
          data: { lastMessageAt: new Date() },
        }),
      ])
      return { id: message.id }
    }),
})

const ORDER_INPUT_STATES = ['in_progress', 'delivered', 'completed', 'cancelled'] as const

const ordersRouter = t.router({
  forThread: authedProcedure
    .input(z.object({ threadId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertParticipant(input.threadId, ctx.user.id)
      const order = await prisma.order.findFirst({
        where: { threadId: input.threadId },
        orderBy: { createdAt: 'desc' },
        include: { review: true, specialist: { include: { specialistProfile: true } } },
      })
      if (!order) return null
      const myRole: OrderActor = order.clientId === ctx.user.id ? 'client' : 'specialist'
      // кейсы-сделки специалиста, доступные для привязки бейджа
      const linkableCases =
        myRole === 'specialist' && order.state === 'COMPLETED'
          ? await prisma.case.findMany({
              where: {
                authorId: ctx.user.id,
                dealType: { not: null },
                dealConfirmedAt: null,
                status: 'PUBLISHED',
                hiddenAt: null,
                deletedAt: null,
              },
              select: { slug: true, title: true },
              take: 20,
            })
          : []
      return {
        id: order.id,
        title: order.title,
        state: ORDER_STATE_TO_CORE[order.state],
        myRole,
        amountMin: order.agreedAmountMin,
        amountMax: order.agreedAmountMax,
        autoConfirmAt: order.autoConfirmAt,
        completedAt: order.completedAt,
        hasReview: order.review != null,
        specialistName: order.specialist.displayName ?? 'Специалист',
        linkableCases,
      }
    }),

  propose: authedProcedure
    .input(
      z
        .object({
          threadId: z.string(),
          title: z.string().trim().min(3).max(120),
          amountMin: z.number().int().positive().optional(),
          amountMax: z.number().int().positive().optional(),
        })
        .refine((v) => !v.amountMin || !v.amountMax || v.amountMin <= v.amountMax, {
          message: 'Нижняя граница вилки не может быть больше верхней.',
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const thread = await assertParticipant(input.threadId, ctx.user.id)
      const me = thread.participants.find((p) => p.userId === ctx.user.id)!
      const other = thread.participants.find((p) => p.userId !== ctx.user.id)
      if (!other) throw new TRPCError({ code: 'BAD_REQUEST', message: 'В диалоге нет второй стороны.' })
      // условия предлагает специалист — у него должен быть профиль
      if (!me.user.specialistProfile) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Заказ предлагает специалист. Попросите его оформить условия в этом диалоге.',
        })
      }
      try {
        const order = await prisma.order.create({
          data: {
            clientId: other.userId,
            specialistId: ctx.user.id,
            threadId: thread.id,
            state: 'DISCUSSION',
            title: input.title,
            agreedAmountMin: input.amountMin ?? null,
            agreedAmountMax: input.amountMax ?? null,
            specialistAgreedAt: new Date(),
            events: { create: { toState: 'DISCUSSION', byUserId: ctx.user.id, reason: 'proposed' } },
          },
        })
        await trackSafe('order_proposed', ctx.user.id, { orderId: order.id })
        await notifySafe(other.userId, 'order_proposed', {
          title: 'Специалист предложил условия заказа',
          body: input.title,
          url: `/messages/${thread.id}`,
        })
        return { orderId: order.id }
      } catch (e) {
        // partial unique index order_one_active_per_thread: гонка двойного propose
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'В этом диалоге уже есть активный заказ.',
          })
        }
        throw e
      }
    }),

  transition: authedProcedure
    .input(z.object({ orderId: z.string(), to: z.enum(['agreed', ...ORDER_INPUT_STATES]) }))
    .mutation(async ({ ctx, input }) => {
      const order = await prisma.order.findUnique({ where: { id: input.orderId } })
      if (!order || (order.clientId !== ctx.user.id && order.specialistId !== ctx.user.id)) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден.' })
      }
      const actor: OrderActor = order.clientId === ctx.user.id ? 'client' : 'specialist'
      const from = ORDER_STATE_TO_CORE[order.state]
      const to = input.to as OrderStatus
      if (!canTransitionOrder(from, to, actor)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Этот шаг сейчас недоступен — обновите страницу или дождитесь второй стороны.',
        })
      }
      // взаимность: propose ставит specialistAgreedAt, «договорились» фиксирует ТОЛЬКО клиент —
      // иначе специалист сам проставил бы согласие клиента (антифрод «2 подтверждения»)
      if (to === 'agreed' && actor !== 'client') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Условия подтверждает клиент.' })
      }
      const now = new Date()
      try {
        await prisma.$transaction([
          prisma.order.update({
            where: { id: order.id, state: order.state }, // оптимистическая блокировка от гонок
            data: {
              state: CORE_TO_ORDER_STATE[to],
              ...(to === 'agreed' ? { clientAgreedAt: now } : {}),
              ...(to === 'in_progress' ? { autoConfirmAt: null } : {}), // возврат на доработку сбрасывает таймер
              ...(to === 'delivered'
                ? { deliveredAt: now, autoConfirmAt: new Date(now.getTime() + AUTO_CONFIRM_DAYS * 864e5) }
                : {}),
              ...(to === 'completed' ? { completedAt: now, confirmedAt: now, autoConfirmed: false } : {}),
              ...(to === 'cancelled' ? { cancelledAt: now, cancelledById: ctx.user.id } : {}),
            },
          }),
          prisma.orderEvent.create({
            data: { orderId: order.id, fromState: order.state, toState: CORE_TO_ORDER_STATE[to], byUserId: ctx.user.id },
          }),
          // событие воронки — атомарно с переходом
          ...(to === 'agreed' || to === 'completed' || to === 'cancelled'
            ? [track(prisma, `order_${to}`, ctx.user.id, { orderId: order.id, auto: false })]
            : []),
        ])
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Статус уже изменился — обновите страницу.',
          })
        }
        throw e
      }
      if (to === 'completed') await recalcReviewAggregate(order.specialistId)
      const threadUrl = order.threadId ? `/messages/${order.threadId}` : undefined
      if (to === 'agreed') {
        await notifySafe(order.specialistId, 'order_agreed', {
          title: 'Клиент подтвердил условия',
          body: order.title,
          url: threadUrl,
        })
      } else if (to === 'delivered') {
        await notifySafe(order.clientId, 'order_delivered', {
          title: 'Работа сдана — подтвердите приёмку',
          body: order.title,
          url: threadUrl,
        })
      } else if (to === 'completed') {
        await notifySafe(order.clientId, 'order_completed', {
          title: 'Заказ завершён — поделитесь отзывом',
          body: order.title,
          url: threadUrl,
        })
        await notifySafe(order.specialistId, 'order_completed', {
          title: 'Заказ завершён',
          body: order.title,
          url: threadUrl,
        })
      } else if (to === 'in_progress' && actor === 'client') {
        await notifySafe(order.specialistId, 'order_returned', {
          title: 'Клиент вернул работу на доработку',
          body: order.title,
          url: threadUrl,
        })
      } else if (to === 'cancelled') {
        await notifySafe(actor === 'client' ? order.specialistId : order.clientId, 'order_cancelled', {
          title: 'Заказ отменён',
          body: order.title,
          url: threadUrl,
        })
      }
      return { state: to }
    }),

  linkCase: authedProcedure
    .input(z.object({ orderId: z.string(), caseSlug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const order = await prisma.order.findUnique({ where: { id: input.orderId } })
      if (!order || order.specialistId !== ctx.user.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден.' })
      }
      if (order.state !== 'COMPLETED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Бейдж выдаётся только по завершённому заказу.',
        })
      }
      const target = await prisma.case.findFirst({
        where: {
          slug: input.caseSlug,
          authorId: ctx.user.id,
          dealType: { not: null },
          status: 'PUBLISHED',
          hiddenAt: null,
          deletedAt: null,
        },
      })
      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Кейс-сделка не найдена среди ваших.' })
      }
      // атомарно: один кейс — один раз; confirmedOrderId @unique = один заказ — один бейдж
      try {
        const updated = await prisma.case.updateMany({
          where: { id: target.id, dealConfirmedAt: null },
          data: {
            dealConfirmedAt: order.completedAt ?? new Date(),
            confirmedOrderId: order.id,
          },
        })
        if (updated.count === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Эта сделка уже подтверждена.' })
        }
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Этот заказ уже подтвердил другой кейс — один заказ даёт один бейдж.',
          })
        }
        throw e
      }
      await recalcDealStats(ctx.user.id)
      return { confirmed: true }
    }),
})

const reviewsRouter = t.router({
  // отзыв — публичный контент: замороженным закрыт (как кейсы/брифы)
  create: activeProcedure
    .input(
      z.object({
        orderId: z.string(),
        quality: z.number().int().min(1).max(5),
        timing: z.number().int().min(1).max(5),
        communication: z.number().int().min(1).max(5),
        budget: z.number().int().min(1).max(5),
        text: z.string().trim().min(10, 'Пара предложений помогут другим клиентам.').max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const order = await prisma.order.findUnique({
        where: { id: input.orderId },
        include: { review: true },
      })
      if (!order || (order.clientId !== ctx.user.id && order.specialistId !== ctx.user.id)) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден.' })
      }
      const gate = canSubmitReview({
        orderStatus: ORDER_STATE_TO_CORE[order.state],
        reviewerIsOrderClient: order.clientId === ctx.user.id,
        alreadyReviewed: order.review != null,
        daysSinceCompleted: order.completedAt
          ? Math.floor((Date.now() - order.completedAt.getTime()) / 864e5)
          : 0,
      })
      if (!gate.allowed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: gate.reason })
      }
      const scores = {
        quality: input.quality,
        timing: input.timing,
        communication: input.communication,
        budget: input.budget,
      }
      if (!isValidScores(scores)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Оценки — целые от 1 до 5.' })
      }
      try {
        await prisma.review.create({
          data: {
            orderId: order.id,
            authorId: ctx.user.id,
            specialistId: order.specialistId,
            scoreQuality: input.quality,
            scoreTimeline: input.timing,
            scoreCommunication: input.communication,
            scoreBudget: input.budget,
            text: input.text,
          },
        })
      } catch (e) {
        // гонка двойной отправки: unique(orderId) — отвечаем человеческим текстом
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Отзыв по этому заказу уже есть.' })
        }
        throw e
      }
      await recalcReviewAggregate(order.specialistId)
      await trackSafe('review_created', ctx.user.id, { orderId: order.id })
      const specProfile = await prisma.specialistProfile.findUnique({
        where: { userId: order.specialistId },
        select: { slug: true },
      })
      const overall = (input.quality + input.timing + input.communication + input.budget) / 4
      await notifySafe(order.specialistId, 'review_new', {
        title: `Новый отзыв — ${overall.toFixed(1)} из 5`,
        body: input.text.slice(0, 120),
        url: specProfile ? `/s/${specProfile.slug}?tab=reviews` : undefined,
      })
      return { ok: true }
    }),
})

/* ============================================================================
 * M4.5: брифы — вторая воронка. Клиент публикует задачу, специалисты
 * откликаются (лимит Free — из core), клиент открывает чат с выбранным.
 * Чтение — server/data.ts (getOpenBriefs/getMyBriefs/getBriefView).
 * ==========================================================================*/

const BRIEF_OBJECT = {
  apartment: 'APARTMENT',
  newBuild: 'NEW_BUILD',
  house: 'HOUSE',
  commercial: 'COMMERCIAL',
  land: 'LAND',
  other: 'OTHER',
} as const

const MAX_OPEN_BRIEFS = 10

const briefsRouter = t.router({
  create: activeProcedure
    .input(
      z
        .object({
          title: z.string().trim().min(5, 'Заголовок — от 5 символов').max(120),
          description: z
            .string()
            .trim()
            .min(20, 'Опишите задачу подробнее — специалистам нужен контекст.')
            .max(2000),
          objectType: z
            .enum(['apartment', 'newBuild', 'house', 'commercial', 'land', 'other'])
            .default('apartment'),
          districtName: z.string().optional(),
          // верхняя граница: int4 в БД — без неё гигантское число даёт 500 вместо 400
          budgetMin: z.number().int().positive().max(2_000_000_000).optional(),
          budgetMax: z.number().int().positive().max(2_000_000_000).optional(),
        })
        .refine((v) => !v.budgetMin || !v.budgetMax || v.budgetMin <= v.budgetMax, {
          message: 'Нижняя граница бюджета не может быть больше верхней.',
        }),
    )
    .mutation(async ({ ctx, input }) => {
      // мягкий стоп спама: старые задачи закрываются, а не копятся
      const openCount = await prisma.brief.count({
        where: { clientId: ctx.user.id, status: 'OPEN', deletedAt: null },
      })
      if (openCount >= MAX_OPEN_BRIEFS) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `У вас уже ${MAX_OPEN_BRIEFS} открытых брифов — закройте неактуальные.`,
        })
      }
      const bishkek = await prisma.city.findUnique({ where: { slug: 'bishkek' } })
      const district = input.districtName
        ? await prisma.district.findFirst({ where: { nameRu: input.districtName } })
        : null
      const brief = await prisma.brief.create({
        data: {
          clientId: ctx.user.id,
          status: 'OPEN',
          title: input.title,
          description: input.description,
          objectType: BRIEF_OBJECT[input.objectType],
          cityId: bishkek?.id ?? null,
          districtId: district?.id ?? null,
          budgetMin: input.budgetMin ?? null,
          budgetMax: input.budgetMax ?? null,
        },
      })
      await trackSafe('brief_created', ctx.user.id, { briefId: brief.id })
      return { id: brief.id }
    }),

  respond: activeProcedure
    .input(
      z.object({
        briefId: z.string(),
        message: z
          .string()
          .trim()
          .min(10, 'Пара предложений о том, как вы решите задачу.')
          .max(2000),
        priceEstimate: z.number().int().positive().max(2_000_000_000).optional(),
        caseSlugs: z.array(z.string()).max(3).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const me = await prisma.specialistProfile.findUnique({ where: { userId: ctx.user.id } })
      if (!me) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Откликаются специалисты. Опубликуйте первый кейс — профиль появится сам.',
        })
      }
      const brief = await prisma.brief.findUnique({ where: { id: input.briefId } })
      if (!brief || brief.deletedAt) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Бриф не найден.' })
      }
      if (brief.clientId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Нельзя откликнуться на собственный бриф.' })
      }
      if (brief.status !== 'OPEN') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Бриф уже закрыт.' })
      }
      // лимит тарифа — гейт из core (best-effort: гонка может дать +1, это ок)
      const plan = await getUserPlan(ctx.user.id)
      const used = await prisma.briefResponse.count({
        where: { specialistId: ctx.user.id, createdAt: { gte: quotaMonthStart() } },
      })
      const gate = canRespondToBrief(plan, used)
      if (!gate.allowed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: gate.reason })
      }
      // кейсы-аргументы: только свои опубликованные
      const uniqueSlugs = [...new Set(input.caseSlugs)]
      const cases = uniqueSlugs.length
        ? await prisma.case.findMany({
            where: {
              slug: { in: uniqueSlugs },
              authorId: ctx.user.id,
              status: 'PUBLISHED',
              hiddenAt: null,
              deletedAt: null,
            },
          })
        : []
      if (cases.length !== uniqueSlugs.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'К отклику можно приложить только свои опубликованные кейсы.',
        })
      }
      try {
        const created = await prisma.briefResponse.create({
          data: {
            briefId: brief.id,
            specialistId: ctx.user.id,
            message: input.message,
            priceEstimate: input.priceEstimate ?? null,
            cases: {
              create: uniqueSlugs.map((slug, i) => ({
                caseId: cases.find((c) => c.slug === slug)!.id,
                sortOrder: i,
              })),
            },
          },
        })
        await trackSafe('brief_response_created', ctx.user.id, {
          briefId: brief.id,
          withCases: uniqueSlugs.length,
        })
        await notifySafe(brief.clientId, 'brief_response', {
          title: 'Новый отклик на ваш бриф',
          body: `${ctx.user.displayName ?? 'Специалист'} — «${brief.title}»`,
          url: `/briefs/${brief.id}`,
        })
        return { id: created.id }
      } catch (e) {
        // unique(briefId, specialistId): двойной клик или второй отклик
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Вы уже откликнулись на этот бриф.' })
        }
        throw e
      }
    }),

  /** Клиент открывает чат по отклику. Идемпотентен: повторный клик не шлёт дубль. */
  accept: authedProcedure
    .input(z.object({ responseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const response = await prisma.briefResponse.findUnique({
        where: { id: input.responseId },
        include: { brief: true },
      })
      if (!response || response.brief.clientId !== ctx.user.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Отклик не найден.' })
      }
      // тот же принцип, что в заявках: один живой диалог на пару
      const existing = await prisma.chatThread.findFirst({
        where: {
          AND: [
            { participants: { some: { userId: ctx.user.id } } },
            { participants: { some: { userId: response.specialistId } } },
          ],
        },
        orderBy: { lastMessageAt: 'desc' },
      })
      const thread =
        existing ??
        (await prisma.chatThread.create({
          data: {
            subject: response.brief.title,
            briefId: response.briefId,
            participants: {
              create: [{ userId: ctx.user.id }, { userId: response.specialistId }],
            },
          },
        }))
      // гейт от двойного клика/двух вкладок: сообщение шлёт только тот запрос,
      // который реально перевёл отклик в ACCEPTED (updateMany вместо read-then-write)
      const claimed = await prisma.briefResponse.updateMany({
        where: { id: response.id, status: { not: 'ACCEPTED' } },
        data: { status: 'ACCEPTED' },
      })
      if (claimed.count === 1) {
        await prisma.$transaction([
          prisma.message.create({
            data: {
              threadId: thread.id,
              senderId: ctx.user.id,
              text: `По брифу «${response.brief.title}»: ваш отклик заинтересовал — давайте обсудим детали.`,
            },
          }),
          prisma.chatThread.update({
            where: { id: thread.id },
            data: { lastMessageAt: new Date() },
          }),
          track(prisma, 'brief_accepted', ctx.user.id, { briefId: response.briefId }),
        ])
        await notifySafe(response.specialistId, 'brief_accepted', {
          title: 'Клиент открыл чат по вашему отклику',
          body: response.brief.title,
          url: `/messages/${thread.id}`,
        })
      }
      return { threadId: thread.id }
    }),

  close: authedProcedure
    .input(z.object({ briefId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await prisma.brief.updateMany({
        where: { id: input.briefId, clientId: ctx.user.id, status: 'OPEN' },
        data: { status: 'CLOSED' },
      })
      if (updated.count === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Бриф не найден или уже закрыт.' })
      }
      return { ok: true }
    }),
})

/* ============================================================================
 * M5: жалобы и модерация. Премодерация новичков (решение 03/4) — в cases.create;
 * здесь: приём жалоб (в т.ч. от гостей) и действия модератора. Чтение очереди —
 * server/data.ts (getModerationQueue).
 * ==========================================================================*/

const REPORTS_PER_DAY = 10
/** потолок анонимных жалоб на один кейс в сутки — дальше принимаем молча, в очередь не льём */
const ANON_REPORTS_PER_TARGET_DAY = 5

const REPORT_REASON = {
  stolen: 'STOLEN_CONTENT',
  spam: 'SPAM',
  contacts: 'CONTACTS_IN_PUBLIC',
  offensive: 'OFFENSIVE',
  fake: 'FAKE',
  other: 'OTHER',
} as const

const reportsRouter = t.router({
  /** Жалоба на кейс. Гостям можно: анонимный cookie вместо аккаунта (решение backend №14). */
  create: publicProcedure
    .input(
      z.object({
        caseSlug: z.string(),
        reason: z.enum(['stolen', 'spam', 'contacts', 'offensive', 'fake', 'other']),
        comment: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const target = await prisma.case.findUnique({ where: { slug: input.caseSlug } })
      // скрытый по жалобе кейс повторно не репортится — очередь не замусоривается
      if (!target || target.deletedAt || target.status !== 'PUBLISHED' || target.hiddenAt) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Кейс не найден.' })
      }
      const reporterId = ctx.user?.id ?? null
      let anonId: string | null = null
      if (!reporterId) {
        // идентичность гостя — HMAC от IP: cookie подделывается ротацией, IP — нет.
        // Соседи по NAT делят лимит — осознанный компромисс MVP (docs/03 §18).
        // fail-closed: зашитая в репо соль → деанонимизация anonId перебором IPv4.
        const salt = process.env.ANON_REPORT_SALT
        if (!salt && process.env.NODE_ENV === 'production') {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Жалобы временно недоступны.' })
        }
        const hdrs = await headers()
        const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
        anonId = createHmac('sha256', salt ?? 'atelier-anon-dev')
          .update(ip)
          .digest('hex')
          .slice(0, 32)
      }
      const sender = reporterId ? { reporterId } : { reporterAnonId: anonId }
      // повторная жалоба того же лица на тот же кейс — не ошибка, а «уже получили»
      const existing = await prisma.report.findFirst({
        where: { targetType: 'CASE', targetId: target.id, ...sender },
      })
      if (existing) return { ok: true, duplicate: true }
      const dayAgo = new Date(Date.now() - 864e5)
      // антиспам: суточный потолок на отправителя
      const recent = await prisma.report.count({
        where: { createdAt: { gte: dayAgo }, ...sender },
      })
      if (recent >= REPORTS_PER_DAY) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Слишком много жалоб за сутки — сделайте паузу.',
        })
      }
      // душ анонимных жалоб на один кейс: сверх потолка принимаем молча (не раскрываем порог)
      if (!reporterId) {
        const anonOnTarget = await prisma.report.count({
          where: {
            targetType: 'CASE',
            targetId: target.id,
            reporterId: null,
            createdAt: { gte: dayAgo },
          },
        })
        if (anonOnTarget >= ANON_REPORTS_PER_TARGET_DAY) return { ok: true, duplicate: false }
      }
      await prisma.report.create({
        data: {
          reporterId,
          reporterAnonId: anonId,
          targetType: 'CASE',
          targetId: target.id,
          reason: REPORT_REASON[input.reason],
          comment: input.comment || null,
        },
      })
      await trackSafe('report_created', reporterId, { caseId: target.id, reason: input.reason })
      return { ok: true, duplicate: false }
    }),
})

const adminRouter = t.router({
  /** Премодерация: одобрить кейс новичка. Порог одобрений повышает автора до TRUSTED. */
  approveCase: moderatorProcedure
    .input(z.object({ caseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const target = await prisma.case.findUnique({ where: { id: input.caseId } })
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Кейс не найден.' })
      const now = new Date()
      const claimed = await prisma.$transaction(async (tx) => {
        const u = await tx.case.updateMany({
          where: { id: target.id, status: 'PENDING_REVIEW' },
          data: { status: 'PUBLISHED', publishedAt: now },
        })
        if (u.count === 1) {
          // сужаем по reason: будущие PHASH/REPORTED-разборы не гасятся одобрением премода
          await tx.moderationItem.updateMany({
            where: { entityType: 'CASE', entityId: target.id, status: 'PENDING', reason: 'NEW_USER_PREMOD' },
            data: { status: 'APPROVED', resolvedById: ctx.user.id, resolvedAt: now },
          })
          await tx.auditLog.create({
            data: { actorId: ctx.user.id, action: 'case.approve', entityType: 'CASE', entityId: target.id },
          })
          await track(tx, 'case_published', target.authorId, { caseId: target.id, viaModeration: true })
        }
        return u.count
      })
      if (claimed === 0) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Кейс уже обработан — обновите страницу.' })
      }
      // повышение автора: после порога одобренных публикуется без очереди
      const author = await prisma.user.findUnique({ where: { id: target.authorId } })
      if (author) {
        // скрытые за нарушения кейсы в порог доверия не засчитываются
        const published = await prisma.case.count({
          where: { authorId: author.id, status: 'PUBLISHED', hiddenAt: null, deletedAt: null },
        })
        if (shouldPromoteToTrusted(author.trustTier, published)) {
          await prisma.user.update({ where: { id: author.id }, data: { trustTier: 'TRUSTED' } })
          await prisma.auditLog.create({
            data: {
              actorId: ctx.user.id,
              action: 'user.promote_trusted',
              entityType: 'USER',
              entityId: author.id,
              payload: { publishedCases: published },
            },
          })
        }
      }
      if (target.dealType) await recalcDealStats(target.authorId)
      await notifySafe(target.authorId, 'case_approved', {
        title: 'Кейс опубликован',
        body: target.title,
        url: `/case/${target.slug}`,
      })
      return { ok: true }
    }),

  /** Премодерация: отклонить кейс с причиной (автор увидит её на странице кейса) */
  rejectCase: moderatorProcedure
    .input(
      z.object({
        caseId: z.string(),
        reason: z.string().trim().min(5, 'Причина нужна автору, чтобы исправить кейс.').max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const target = await prisma.case.findUnique({ where: { id: input.caseId } })
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Кейс не найден.' })
      const now = new Date()
      const claimed = await prisma.$transaction(async (tx) => {
        const u = await tx.case.updateMany({
          where: { id: input.caseId, status: 'PENDING_REVIEW' },
          data: { status: 'REJECTED' },
        })
        if (u.count === 1) {
          await tx.moderationItem.updateMany({
            where: { entityType: 'CASE', entityId: input.caseId, status: 'PENDING', reason: 'NEW_USER_PREMOD' },
            data: { status: 'REJECTED', resolvedById: ctx.user.id, resolvedAt: now, resolution: input.reason },
          })
          await tx.auditLog.create({
            data: {
              actorId: ctx.user.id,
              action: 'case.reject',
              entityType: 'CASE',
              entityId: input.caseId,
              payload: { reason: input.reason },
            },
          })
        }
        return u.count
      })
      if (claimed === 0) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Кейс уже обработан — обновите страницу.' })
      }
      await notifySafe(target.authorId, 'case_rejected', {
        title: 'Кейс отклонён модерацией',
        body: input.reason,
        url: `/case/${target.slug}`,
      })
      return { ok: true }
    }),

  /**
   * Решение по жалобе. hide: контент скрывается, автору — страйк
   * (3 страйка = заморозка). dismiss: жалоба отклонена, контент не тронут.
   */
  resolveReport: moderatorProcedure
    .input(z.object({ reportId: z.string(), action: z.enum(['hide', 'dismiss']) }))
    .mutation(async ({ ctx, input }) => {
      const report = await prisma.report.findUnique({ where: { id: input.reportId } })
      if (!report) throw new TRPCError({ code: 'NOT_FOUND', message: 'Жалоба не найдена.' })
      const now = new Date()

      if (input.action === 'dismiss') {
        const claimed = await prisma.$transaction(async (tx) => {
          const u = await tx.report.updateMany({
            where: { id: report.id, status: 'OPEN' },
            data: { status: 'DISMISSED', resolvedById: ctx.user.id, resolvedAt: now },
          })
          if (u.count === 1) {
            await tx.auditLog.create({
              data: { actorId: ctx.user.id, action: 'report.dismiss', entityType: report.targetType, entityId: report.targetId },
            })
          }
          return u.count
        })
        if (claimed === 0) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Жалоба уже обработана.' })
        }
        return { ok: true }
      }

      // hide: поддерживаем кейсы и отзывы (MVP-объекты жалоб)
      if (report.targetType !== 'CASE' && report.targetType !== 'REVIEW') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Этот тип жалобы пока разбирается вручную.' })
      }
      const result = await prisma.$transaction(async (tx) => {
        const u = await tx.report.updateMany({
          where: { id: report.id, status: 'OPEN' },
          data: { status: 'RESOLVED', resolvedById: ctx.user.id, resolvedAt: now },
        })
        if (u.count === 0) return null
        // страйк — автору контента; витрина пересчитывается у специалиста,
        // к которому контент относится (для отзыва это НЕ его автор-клиент)
        let offenderId: string
        let recalcSpecialistId: string
        let hidNow: number
        if (report.targetType === 'CASE') {
          const kase = await tx.case.findUnique({ where: { id: report.targetId } })
          if (!kase) throw new TRPCError({ code: 'NOT_FOUND', message: 'Кейс жалобы не найден.' })
          const h = await tx.case.updateMany({
            where: { id: kase.id, hiddenAt: null },
            data: { hiddenAt: now },
          })
          hidNow = h.count
          offenderId = kase.authorId
          recalcSpecialistId = kase.authorId
        } else {
          const review = await tx.review.findUnique({ where: { id: report.targetId } })
          if (!review) throw new TRPCError({ code: 'NOT_FOUND', message: 'Отзыв жалобы не найден.' })
          const h = await tx.review.updateMany({
            where: { id: review.id, hiddenAt: null },
            data: { hiddenAt: now },
          })
          hidNow = h.count
          offenderId = review.authorId
          recalcSpecialistId = review.specialistId
        }
        // одно нарушение = один страйк: вторая жалоба на УЖЕ скрытый контент
        // резолвится без страйка (иначе 3 жалобы на один кейс = заморозка)
        if (hidNow === 1) {
          await tx.userStrike.create({
            data: { userId: offenderId, reasonCode: report.reason, comment: report.comment },
          })
          // 3 страйка = заморозка (инвариант из core)
          const strikes = await tx.userStrike.count({ where: { userId: offenderId } })
          if (shouldFreeze(strikes)) {
            await tx.user.updateMany({ where: { id: offenderId, frozenAt: null }, data: { frozenAt: now } })
            await tx.auditLog.create({
              data: { actorId: ctx.user.id, action: 'user.freeze', entityType: 'USER', entityId: offenderId, payload: { strikes } },
            })
          }
        }
        await tx.auditLog.create({
          data: {
            actorId: ctx.user.id,
            action: 'report.hide_content',
            entityType: report.targetType,
            entityId: report.targetId,
            payload: { reason: report.reason, alreadyHidden: hidNow === 0 },
          },
        })
        return { recalcSpecialistId, offenderId, struck: hidNow === 1 }
      })
      if (!result) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Жалоба уже обработана.' })
      }
      // витрина пересчитывается вне транзакции: скрытое выпадает из агрегатов
      await recalcReviewAggregate(result.recalcSpecialistId)
      await recalcDealStats(result.recalcSpecialistId)
      // повторная резолюция по уже скрытому контенту страйка не даёт —
      // и не пугает автора вторым «это страйк» (уведомление уже уходило)
      if (result.struck) {
        await notifySafe(result.offenderId, 'content_hidden', {
          title: report.targetType === 'CASE' ? 'Кейс скрыт после жалобы' : 'Отзыв скрыт после жалобы',
          body: 'Это страйк. Три страйка замораживают аккаунт — подробности в поддержке.',
        })
      }
      return { ok: true }
    }),
})

/* ============================================================================
 * M6: монетизация (промокоды → PRO) и настройки уведомлений.
 * Оплата картой — Фаза 1.5 (PaymentProvider: Mbank/O!Деньги/Элсом), до неё
 * PRO активируется промокодом или админом вручную.
 * ==========================================================================*/

const promoRouter = t.router({
  redeem: authedProcedure
    .input(z.object({ code: z.string().trim().min(3).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const code = await prisma.promoCode.findUnique({
        where: { code: input.code.toUpperCase() },
        include: { plan: true },
      })
      if (!code || !code.isActive || (code.expiresAt && code.expiresAt < new Date())) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Код не найден или истёк.' })
      }
      const pro = await getProStatus(ctx.user.id)
      if (pro.active) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: pro.until
            ? `PRO уже активен до ${pro.until.toLocaleDateString('ru-RU')} — код можно применить после.`
            : 'PRO уже активен бессрочно.',
        })
      }
      const expiresAt = new Date(Date.now() + code.durationDays * 864e5)
      let redeemed: boolean
      try {
        redeemed = await redeemTx(ctx.user.id, code, expiresAt)
      } catch (e) {
        // unique(userId, promoCodeId): двойной клик и ре-редим после истечения
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Этот код вы уже использовали.' })
        }
        throw e
      }
      if (!redeemed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Код уже использован максимальное число раз.' })
      }
      return { plan: code.plan.code, until: expiresAt }
    }),
})

/** Атомарный расход промокода: гонки не перерасходуют использования */
function redeemTx(
  userId: string,
  code: { id: string; planId: string; code: string; durationDays: number; maxRedemptions: number },
  expiresAt: Date,
) {
  return prisma.$transaction(async (tx) => {
    const u = await tx.promoCode.updateMany({
      where: { id: code.id, isActive: true, redeemedCount: { lt: code.maxRedemptions } },
      data: { redeemedCount: { increment: 1 } },
    })
    if (u.count === 0) return false
    await tx.entitlement.create({
      data: {
        userId,
        planId: code.planId,
        status: 'ACTIVE',
        source: 'PROMO',
        promoCodeId: code.id,
        expiresAt,
      },
    })
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'promo.redeem',
        entityType: 'PROMO_CODE',
        entityId: code.id,
        payload: { code: code.code, days: code.durationDays },
      },
    })
    await track(tx, 'promo_redeemed', userId, { code: code.code, days: code.durationDays })
    return true
  })
}

const notificationsRouter = t.router({
  /** Отвязать Telegram (эквивалент /stop в боте) */
  unlinkTelegram: authedProcedure.mutation(async ({ ctx }) => {
    await prisma.user.update({ where: { id: ctx.user.id }, data: { telegramChatId: null } })
    return { ok: true }
  }),

  /** Публичный VAPID-ключ (не секрет); null = push-канал не настроен.
   *  Настройки получают ключ пропом с сервера; этот эндпоинт — для подписки
   *  с других поверхностей (PWA-инсталл, пост-онбординг nudge) без RSC-пропа. */
  pushKey: publicProcedure.query(() => ({ key: getVapidPublicKey() })),

  /**
   * Подписка Web Push (M11). Upsert по endpoint: подписка принадлежит браузеру,
   * а браузер — тому, кто в нём залогинен; перелогин переприсваивает подписку.
   */
  subscribePush: authedProcedure
    .input(
      z.object({
        endpoint: z
          .string()
          .max(1000)
          .url()
          .refine((v) => v.startsWith('https://'), 'Только https'),
        p256dh: z.string().min(1).max(200),
        auth: z.string().min(1).max(200),
        userAgent: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await prisma.pushSubscription.upsert({
        where: { endpoint: input.endpoint },
        create: {
          userId: ctx.user.id,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent: input.userAgent ?? null,
        },
        update: {
          userId: ctx.user.id,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent: input.userAgent ?? null,
        },
      })
      // кап устройств: старейшие сверх лимита выбывают (защита бюджета отправки)
      const extra = await prisma.pushSubscription.findMany({
        where: { userId: ctx.user.id },
        orderBy: { createdAt: 'desc' },
        skip: MAX_PUSH_SUBSCRIPTIONS,
        select: { id: true },
      })
      if (extra.length > 0) {
        await prisma.pushSubscription.deleteMany({
          where: { id: { in: extra.map((e) => e.id) } },
        })
      }
      return { ok: true }
    }),

  /** Отписка: только свою подписку (endpoint+userId) */
  unsubscribePush: authedProcedure
    .input(z.object({ endpoint: z.string().max(1000) }))
    .mutation(async ({ ctx, input }) => {
      await prisma.pushSubscription.deleteMany({
        where: { endpoint: input.endpoint, userId: ctx.user.id },
      })
      return { ok: true }
    }),
})

const SPECIALIZATIONS = [
  'REALTOR',
  'ARCHITECT',
  'INTERIOR_DESIGNER',
  'LANDSCAPE_DESIGNER',
  'DECORATOR_STAGER',
  'VISUALIZER_3D',
  'PHOTO_VIDEO',
] as const

const profilesRouter = t.router({
  /**
   * Онбординг/настройка профиля специалиста (M6.2): имя, специализация, «работаю
   * в X», районы экспертизы. Идемпотентен — повторный вызов редактирует. Профиль
   * создаётся здесь (самозапись), а не только лениво при первом кейсе.
   */
  setup: activeProcedure
    .input(
      z.object({
        // контакт-детект на записи: имя и метка публичны везде (каталог, кейс, OG),
        // телефон/ник в них обнулял бы петлю заявок («телефоны скрыты до заявки»)
        displayName: z
          .string()
          .trim()
          .min(2, 'Имя — от 2 символов')
          .max(60)
          .refine((v) => hideContacts(v) === v, 'Уберите телефон или ник из имени — контакты клиент получает после заявки.'),
        specialization: z.enum(SPECIALIZATIONS),
        worksAt: z
          .string()
          .trim()
          .max(80)
          .refine((v) => hideContacts(v) === v, 'Уберите телефон или ник — контакты клиент получает после заявки.')
          .optional(),
        districtSlugs: z
          .array(z.string().max(80))
          .max(MAX_EXPERTISE_DISTRICTS, `Не больше ${MAX_EXPERTISE_DISTRICTS} районов`)
          .default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // инвариант лимита — из core (Zod дублирует для ранней ошибки формы)
      const check = canSelectExpertiseDistricts(input.districtSlugs.length)
      if (!check.allowed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: check.reason })
      }
      // районы валидируем по справочнику — мусорные слаги молча отбрасываем
      const districts = input.districtSlugs.length
        ? await prisma.district.findMany({ where: { slug: { in: input.districtSlugs } } })
        : []
      const bishkek = await prisma.city.findUnique({ where: { slug: 'bishkek' } })

      const runSetup = () =>
        prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: ctx.user.id },
          data: { displayName: input.displayName },
        })
        const existing = await tx.specialistProfile.findUnique({
          where: { userId: ctx.user.id },
        })
        const profile = existing
          ? await tx.specialistProfile.update({
              where: { id: existing.id },
              data: {
                specialization: input.specialization,
                worksAtLabel: input.worksAt || null,
                cityId: existing.cityId ?? bishkek?.id,
              },
            })
          : await tx.specialistProfile.create({
              data: {
                userId: ctx.user.id,
                slug: `s-${ctx.user.id.slice(-8)}`,
                specialization: input.specialization,
                worksAtLabel: input.worksAt || null,
                cityId: bishkek?.id,
                reviewAggregate: { create: {} },
              },
            })
        // полная замена набора районов (как styleIds по контракту docs/12 §7)
        await tx.specialistDistrict.deleteMany({ where: { specialistProfileId: profile.id } })
        if (districts.length) {
          await tx.specialistDistrict.createMany({
            data: districts.map((d) => ({ specialistProfileId: profile.id, districtId: d.id })),
          })
        }
        // роль повышаем только клиенту (модератор/админ не теряет доступ)
        if (ctx.user.role === 'CLIENT') {
          await tx.user.update({ where: { id: ctx.user.id }, data: { role: 'SPECIALIST' } })
        }
        await track(tx, 'onboarding_completed', ctx.user.id, {
          specialization: input.specialization.toLowerCase(),
          districts: districts.length,
          isEdit: Boolean(existing),
        })
        return profile.slug
      })

      // гонка двух первых setup (две вкладки): оба видят existing=null, второй
      // падает P2002 на userId @unique — повтор находит профиль и идёт в update
      let slug: string
      try {
        slug = await runSetup()
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          slug = await runSetup()
        } else {
          throw e
        }
      }
      return { slug }
    }),
})

/**
 * Backstop против накрутки/спама публичного analytics.share: фиксированное окно в
 * памяти процесса. Best-effort (в multi-instance у каждого инстанса своя память) —
 * этого достаточно против curl-циклов и случайной амплификации share-rate, ради
 * которой блок и делается. Событие fire-and-forget и некритично, поэтому свыше
 * лимита молча роняем без ошибки. Не per-event DB-count — не грузим БД на частом
 * событии. Ключ — по юзеру (если вошёл) или по IP.
 */
const SHARE_RATE_LIMIT = 30
const SHARE_RATE_WINDOW_MS = 5 * 60_000
const shareHits = new Map<string, { count: number; resetAt: number }>()
function allowShare(key: string, now: number): boolean {
  const hit = shareHits.get(key)
  if (!hit || now >= hit.resetAt) {
    // протухшие ключи подметаем при разрастании — карта не растёт бесконечно
    if (shareHits.size > 5000) {
      for (const [k, v] of shareHits) if (now >= v.resetAt) shareHits.delete(k)
    }
    shareHits.set(key, { count: 1, resetAt: now + SHARE_RATE_WINDOW_MS })
    return true
  }
  if (hit.count >= SHARE_RATE_LIMIT) return false
  hit.count++
  return true
}

const analyticsRouter = t.router({
  /**
   * Клиентское событие шеринга (визитка/ссылка). Узкий вайтлист + короткие поля,
   * чтобы публичная ручка не засоряла outbox произвольными событиями. Гость тоже
   * может делиться — публичная процедура; сбой аналитики не роняет ответ.
   */
  share: publicProcedure
    .input(
      z.object({
        surface: z.enum(SHARE_SURFACES),
        method: z.enum(SHARE_METHODS),
        slug: z.string().max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = Date.now()
      let key: string
      if (ctx.user) {
        key = `u:${ctx.user.id}`
      } else {
        const hdrs = await headers()
        key = `ip:${hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'}`
      }
      // свыше лимита — молча (не раскрываем порог, не роняем шеринг)
      if (!allowShare(key, now)) return { ok: true }
      await trackSafe('content_shared', ctx.user?.id ?? null, {
        surface: input.surface,
        method: input.method,
        slug: input.slug,
      })
      return { ok: true }
    }),
})

export const appRouter = t.router({
  auth: authRouter,
  cases: casesRouter,
  saves: savesRouter,
  leads: leadsRouter,
  chat: chatRouter,
  orders: ordersRouter,
  reviews: reviewsRouter,
  briefs: briefsRouter,
  reports: reportsRouter,
  admin: adminRouter,
  promo: promoRouter,
  notifications: notificationsRouter,
  profiles: profilesRouter,
  analytics: analyticsRouter,
})

export type AppRouter = typeof appRouter
