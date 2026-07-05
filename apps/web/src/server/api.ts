import { randomBytes, timingSafeEqual } from 'node:crypto'
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { z } from 'zod'
import { derivePriceRange } from '@atelier/core'
import { prisma, Prisma } from '@atelier/db'
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
  create: authedProcedure
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
          price: z.number().int().positive().optional(),
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
        await prisma.user.update({ where: { id: ctx.user.id }, data: { role: 'SPECIALIST' } })
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

      const created = await prisma.case.create({
        data: {
          authorId: ctx.user.id,
          slug,
          title: input.title,
          // trust-tiers: премодерация новичков — M5; в M2 публикуем сразу
          status: 'PUBLISHED',
          publishedAt: new Date(),
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
      return { slug: created.slug }
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

export const appRouter = t.router({
  auth: authRouter,
  cases: casesRouter,
  saves: savesRouter,
})

export type AppRouter = typeof appRouter
