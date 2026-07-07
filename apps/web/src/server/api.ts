import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { headers } from 'next/headers'
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { z } from 'zod'
import {
  canModerate,
  canRespondToBrief,
  canSubmitReview,
  canTransitionOrder,
  derivePriceRange,
  isValidScores,
  needsPremoderation,
  quotaMonthStart,
  shouldFreeze,
  shouldPromoteToTrusted,
  AUTO_CONFIRM_DAYS,
  type OrderActor,
  type OrderStatus,
} from '@atelier/core'
import { prisma, Prisma, type OrderState } from '@atelier/db'
import { recalcDealStats, recalcReviewAggregate } from './aggregates'
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
      // M6: Telegram Gateway / SMS. Код на экран: в dev — всем; в песочнице
      // (OTP_DEV_MODE=1) — ТОЛЬКО тестовым номерам сида, не любому телефону.
      const isDev = process.env.NODE_ENV !== 'production'
      const isSandboxTestPhone =
        process.env.OTP_DEV_MODE === '1' && /^\+9967000\d{5}$/.test(input.phone)
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
// mock/-пути разрешены вне production (демо-кнопка мастера и сид).
const UPLOAD_SRC_RE = /^\/uploads\/[a-f0-9]+\.webp$/
const MOCK_SRC_RE = /^\/mock\/[a-z0-9-]+\.jpg$/
const uploadedImage = z.object({
  storageKey: z.string().min(1).max(200),
  src: z
    .string()
    .refine(
      (s) =>
        UPLOAD_SRC_RE.test(s) ||
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
        }),
      ])
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
      if (to === 'agreed' || to === 'completed' || to === 'cancelled') {
        await trackSafe(`order_${to}`, ctx.user.id, { orderId: order.id, auto: false })
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
      // лимит тарифа — гейт из core (best-effort: гонка может дать +1, это ок);
      // тариф пока один (Free), PRO придёт с биллингом
      const used = await prisma.briefResponse.count({
        where: { specialistId: ctx.user.id, createdAt: { gte: quotaMonthStart() } },
      })
      const gate = canRespondToBrief('FREE', used)
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
        const hdrs = await headers()
        const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
        anonId = createHmac('sha256', process.env.ANON_REPORT_SALT ?? 'atelier-anon-dev')
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
        return { recalcSpecialistId }
      })
      if (!result) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Жалоба уже обработана.' })
      }
      // витрина пересчитывается вне транзакции: скрытое выпадает из агрегатов
      await recalcReviewAggregate(result.recalcSpecialistId)
      await recalcDealStats(result.recalcSpecialistId)
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
})

export type AppRouter = typeof appRouter
