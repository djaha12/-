/**
 * Seed dev-БД из канонических мок-данных apps/web (M2).
 * Честность данных: отзывы создаются ТОЛЬКО поверх COMPLETED-заказов,
 * dealConfirmedAt ставится только сделкам, у которых есть такой заказ.
 * Запуск: pnpm --filter @atelier/db seed (БД: scripts/dev-db.mjs start)
 */
import { prisma } from './index'
import type { Prisma, Specialization } from './index'
import {
  cases as mockCases,
  dealReviews,
  reviews as designReviews,
  specialists as mockSpecialists,
  type CaseItem,
  type Specialist,
} from '../../../apps/web/src/mock/data'
import images from '../../../apps/web/src/mock/images.json'

type Img = { src: string; width: number; height: number; blurDataURL: string }
const IMG = images as Record<string, Img>

const SPECIALIZATION: Record<string, Specialization> = {
  Риелтор: 'REALTOR',
  Архитектор: 'ARCHITECT',
  'Дизайнер интерьера': 'INTERIOR_DESIGNER',
  'Ландшафтный дизайнер': 'LANDSCAPE_DESIGNER',
  Хоумстейджер: 'DECORATOR_STAGER',
  Декоратор: 'DECORATOR_STAGER',
  '3D-визуализатор': 'VISUALIZER_3D',
  'Фотограф недвижимости': 'PHOTO_VIDEO',
}

const PROPERTY_TYPE: Record<string, 'APARTMENT' | 'HOUSE' | 'COMMERCIAL' | 'NEW_BUILD'> = {
  Вторичка: 'APARTMENT',
  Новостройка: 'NEW_BUILD',
  Дом: 'HOUSE',
  Коммерция: 'COMMERCIAL',
}

const DEAL_TYPE = { sale: 'SALE', rentOut: 'RENT_OUT', buyAssist: 'BUY_ASSIST' } as const

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}
const slugify = (s: string) =>
  s
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** '~20 минут' → 20, '~2 часа' → 120 */
const responseMinutes = (s: string): number => {
  const n = Number(s.replace(/\D/g, '') || 60)
  return /час/.test(s) ? n * 60 : n
}

const CITIES = [
  { slug: 'bishkek', nameRu: 'Бишкек' },
  { slug: 'osh', nameRu: 'Ош' },
  { slug: 'cholpon-ata', nameRu: 'Чолпон-Ата' },
  { slug: 'koy-tash', nameRu: 'Кой-Таш' },
  { slug: 'bosteri', nameRu: 'Бостери' },
]
const BISHKEK_DISTRICTS = [
  'Центр', 'Джал', 'Магистраль', 'Кок-Жар', 'Асанбай', 'Тунгуч',
  'Аламедин-1', 'Арча-Бешик', 'Кара-Жыгач', 'Моссовет',
]

/** 'Бишкек, центр' → {city:'bishkek', district:'Центр'} */
function parseLocation(location: string): { citySlug: string; districtName?: string } {
  const [cityRaw, districtRaw] = location.split(',').map((x) => x.trim())
  const city = CITIES.find((c) => c.nameRu === cityRaw)
  if (!city) throw new Error(`Неизвестный город в моках: ${location}`)
  return { citySlug: city.slug, districtName: districtRaw ? cap(districtRaw) : undefined }
}

function imageCreate(imageId: string, sortOrder: number, extra?: Partial<Prisma.CaseImageCreateWithoutCaseInput>) {
  const img = IMG[imageId]
  if (!img) throw new Error(`Нет изображения ${imageId} — запустите pnpm gen:mock`)
  return {
    storageKey: `mock/${imageId}.jpg`,
    variants: { original: img.src },
    blurhash: img.blurDataURL,
    width: img.width,
    height: img.height,
    sortOrder,
    ...extra,
  } satisfies Prisma.CaseImageCreateWithoutCaseInput
}

/** дополнительные изображения флагманских кейсов (галерея + до/после) */
const GALLERIES: Record<string, { gallery: string[]; beforeAfter?: [string, string] }> = {
  'loft-dzhal-72': { gallery: ['g1', 'g2', 'g3', 'g4', 'g5'], beforeAfter: ['ba-before', 'ba-after'] },
  'dvushka-toktogula': { gallery: ['dg-hero', 'd02', 'g3', 'd05'], beforeAfter: ['ba-before', 'ba-after'] },
}

/** авторские описания флагманов; у кейсов без описания секция «история» скрывается */
const DESCRIPTIONS: Record<string, string> = {
  'loft-dzhal-72':
    'Пара переехала из съёмной квартиры и хотела «спокойный лофт»: бетон и дерево, но без холодности. Мы сохранили открытую планировку, подняли свет тремя сценариями и собрали кухню-гостиную вокруг острова — это центр дома, здесь завтракают и принимают гостей.\n\nБюджет держали публично в смете: локальные материалы там, где это не влияет на результат, и точечные акценты — латунь, травертин. Сдача — за 3,5 месяца, еженедельные чек-поинты с фото фиксировались прямо в заказе на Ателье.',
  'dvushka-toktogula':
    'Квартира четыре месяца продавалась без результата: тёмные фото, завышенная цена, ноль звонков за последние недели. Мы начали с честной переоценки по свежим сделкам в этом квадрате — и с подготовки: хоумстейджинг за один день и профессиональная съёмка.\n\nПереупакованный объект собрал 26 обращений за первую неделю. Показы вели пакетно, торг держали от опорной цены — задаток взяли на 18-й день, итоговая цена выше первоначальных ожиданий собственницы. Все этапы фиксировались в заказе на Ателье.',
}

async function main() {
  if ((await prisma.user.count()) > 0) {
    console.log('БД уже насеяна — пропускаю (для пересева: удалите .data/pg и повторите миграцию)')
    return
  }

  // --- справочники ---
  const cityId: Record<string, string> = {}
  for (const [i, c] of CITIES.entries()) {
    const row = await prisma.city.create({ data: { slug: c.slug, nameRu: c.nameRu, sortOrder: i } })
    cityId[c.slug] = row.id
  }
  const districtId: Record<string, string> = {}
  for (const name of BISHKEK_DISTRICTS) {
    const row = await prisma.district.create({
      data: { cityId: cityId['bishkek']!, slug: slugify(name), nameRu: name },
    })
    districtId[name] = row.id
  }

  const styleNames = new Set<string>()
  for (const s of mockSpecialists) s.styles.forEach((x) => styleNames.add(x))
  for (const c of mockCases) c.styles.forEach((x) => styleNames.add(x))
  const styleId: Record<string, string> = {}
  for (const name of styleNames) {
    const row = await prisma.style.create({ data: { slug: slugify(name), nameRu: name } })
    styleId[name] = row.id
  }

  // --- специалисты: user + profile + агрегаты ---
  const userIdBySlug: Record<string, string> = {}
  for (const [i, s] of mockSpecialists.entries()) {
    const user = await prisma.user.create({
      data: {
        phone: `+99670000${String(i + 1).padStart(4, '0')}`,
        phoneVerifiedAt: new Date(),
        role: 'SPECIALIST',
        trustTier: 'TRUSTED',
        displayName: s.name,
      },
    })
    userIdBySlug[s.slug] = user.id

    const loc = s.city === 'Ош' ? 'osh' : 'bishkek'
    await prisma.specialistProfile.create({
      data: {
        userId: user.id,
        slug: s.slug,
        specialization: SPECIALIZATION[s.profession],
        bio: s.bio || null,
        cityId: cityId[loc]!,
        priceMin: s.priceFrom > 0 ? s.priceFrom : null,
        priceMax: s.priceTo > 0 ? s.priceTo : null,
        priceUnit: 'PER_M2',
        acceptsOrders: s.acceptsOrders,
        worksAtLabel: s.worksAt ?? null,
        declaredDealsCount: s.dealStats?.closed ?? null,
        identityVerifiedAt: s.verified ? new Date() : null,
        medianResponseMinutes: responseMinutes(s.responseTime),
        styles: { create: s.styles.map((name) => ({ styleId: styleId[name]! })) },
        expertiseDistricts: s.dealStats
          ? { create: s.dealStats.districts.map((d) => ({ districtId: districtId[d]! })) }
          : undefined,
        reviewAggregate: {
          create: {
            reviewsCount: s.reviewsCount,
            avgOverall: s.rating,
            avgQuality: s.rating,
            avgTimeline: Math.max(1, s.rating - 0.1),
            avgCommunication: s.rating,
            avgBudget: Math.max(1, s.rating - 0.05),
            completedOrdersCount: s.projectsCount,
            repeatClientsPct: s.repeatClientsPct,
            confirmedDealsCount: s.dealStats?.confirmed ?? 0,
            dealCasesCount: 0, // пересчитаем после кейсов
            medianDaysOnMarket: s.dealStats?.medianDaysOnMarket ?? null,
          },
        },
      },
    })
  }

  // --- кейсы ---
  for (const [i, c] of mockCases.entries()) {
    const { citySlug, districtName } = parseLocation(c.location)
    const extra = GALLERIES[c.slug]
    // детерминированное рассеивание дат: сделки риелторов не сбиваются в хвост ленты
    const scatter = (i * 13) % mockCases.length
    const publishedAt = new Date(Date.now() - (scatter + 1) * 36e5 * 20)

    // обложка мок-кейса: '/mock/c01.jpg' → id 'c01'
    const coverId = c.image.src.replace('/mock/', '').replace('.jpg', '')
    const created = await prisma.case.create({
      data: {
        authorId: userIdBySlug[c.specialistSlug]!,
        slug: c.slug,
        title: c.title,
        description: DESCRIPTIONS[c.slug] ?? null,
        status: 'PUBLISHED',
        publishedAt,
        authorRole: c.deal ? 'REALTOR_LISTING' : 'FULL_PROJECT',
        cityId: cityId[citySlug]!,
        districtId: districtName ? (districtId[districtName] ?? null) : null,
        areaM2: c.areaM2 ?? null,
        budgetMin: c.budgetFrom > 0 ? c.budgetFrom : null,
        budgetMax: c.budgetTo > 0 ? c.budgetTo : null,
        hasPublishRights: true,
        savesCount: c.saves,
        dealType: c.deal ? DEAL_TYPE[c.deal.type] : null,
        propertyType: c.deal ? PROPERTY_TYPE[c.deal.propertyType] : null,
        dealPriceSom: c.deal?.price ?? null,
        dealPriceVisibility: c.deal ? (c.deal.price ? 'EXACT' : 'HIDDEN') : 'RANGE',
        daysOnMarket: c.deal?.daysOnMarket ?? null,
        // dealConfirmedAt проставим ниже — только тем, у кого создан COMPLETED-заказ
        styles: { create: c.styles.map((name) => ({ styleId: styleId[name]! })) },
        images: {
          create: [
            imageCreate(coverId, 0),
            ...(extra?.gallery ?? []).map((id, j) => imageCreate(id, j + 1)),
            ...(extra?.beforeAfter
              ? [
                  imageCreate(extra.beforeAfter[0], 90, { isBeforeImage: true, beforeAfterGroup: 'ba-1' }),
                  imageCreate(extra.beforeAfter[1], 91, { beforeAfterGroup: 'ba-1' }),
                ]
              : []),
          ],
        },
      },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    })
    await prisma.case.update({
      where: { id: created.id },
      data: { coverImageId: created.images[0]!.id },
    })
  }

  // --- клиенты, завершённые заказы и отзывы (честная цепочка) ---
  const reviewSeed: Array<{
    specialistSlug: string
    reviews: typeof designReviews
    confirmCaseSlugs: string[]
  }> = [
    { specialistSlug: 'aizhan-saparova', reviews: designReviews, confirmCaseSlugs: [] },
    {
      specialistSlug: 'nurlan-abdykadyrov',
      reviews: dealReviews,
      confirmCaseSlugs: ['dvushka-toktogula', 'treshka-dzhal-remont', 'arenda-ofis-manasa', 'podbor-studiya-asman'],
    },
  ]

  let clientN = 0
  const clientIdByName: Record<string, string> = {}
  for (const group of reviewSeed) {
    const specialistUserId = userIdBySlug[group.specialistSlug]!
    for (const r of group.reviews) {
      clientN++
      const client = await prisma.user.create({
        data: {
          phone: `+99670001${String(clientN).padStart(4, '0')}`,
          phoneVerifiedAt: new Date(),
          role: 'CLIENT',
          displayName: r.author,
        },
      })
      clientIdByName[r.author] = client.id
      const completedAt = new Date(Date.now() - clientN * 36e5 * 24 * 9)
      const order = await prisma.order.create({
        data: {
          clientId: client.id,
          specialistId: specialistUserId,
          state: 'COMPLETED',
          title: r.caseTitle,
          clientAgreedAt: completedAt,
          specialistAgreedAt: completedAt,
          deliveredAt: completedAt,
          confirmedAt: completedAt,
          completedAt,
        },
      })
      await prisma.review.create({
        data: {
          orderId: order.id,
          authorId: client.id,
          specialistId: specialistUserId,
          scoreQuality: r.quality,
          scoreTimeline: r.timing,
          scoreCommunication: r.communication,
          scoreBudget: r.budget,
          text: r.text,
          createdAt: completedAt,
        },
      })
    }
    // подтверждение сделок — только при существующем завершённом заказе у специалиста
    for (const slug of group.confirmCaseSlugs) {
      await prisma.case.update({ where: { slug }, data: { dealConfirmedAt: new Date() } })
    }
  }

  // --- демо-диалоги M4: живой чат + заказы в показательных статусах ---
  const demoThreads: Array<{
    clientName: string
    specialistSlug: string
    subject: string
    messages: Array<{ fromClient: boolean; text: string }>
    order?: { title: string; min: number; max: number; state: 'DELIVERED' | 'COMPLETED' }
  }> = [
    {
      clientName: 'Гульмира А.',
      specialistSlug: 'nurlan-abdykadyrov',
      subject: 'Продажа трёшки в Джале',
      messages: [
        { fromClient: true, text: 'Нурлан, здравствуйте! Продаём трёшку в Джале, 82 м². Хотим успеть до сентября — реально?' },
        { fromClient: false, text: 'Здравствуйте! Да, реально: похожую в вашем доме закрыли за 31 день. Завтра могу посмотреть квартиру и предложить план по цене.' },
        { fromClient: true, text: 'Отлично, давайте завтра после 18:00.' },
        { fromClient: false, text: 'Договорились. Отправляю условия заказом — там зафиксируем ориентир цены и что входит в подготовку.' },
      ],
      order: { title: 'Продажа трёшки в Джале, 82 м²', min: 6_200_000, max: 6_450_000, state: 'DELIVERED' },
    },
    {
      clientName: 'Салтанат Э.',
      specialistSlug: 'aizhan-saparova',
      subject: 'Спальня в тёплых тонах',
      messages: [
        { fromClient: true, text: 'Айжан, добрый день! После лофта хотим доделать спальню — в тех же материалах.' },
        { fromClient: false, text: 'Добрый! С удовольствием — базу по материалам сохранила. Сдала проект, посмотрите планшет во вложении к заказу.' },
      ],
      order: { title: 'Дизайн-проект спальни, 21 м²', min: 350_000, max: 420_000, state: 'COMPLETED' },
    },
  ]

  for (const t of demoThreads) {
    const clientId = clientIdByName[t.clientName]!
    const specialistId = userIdBySlug[t.specialistSlug]!
    const base = Date.now() - 36e5 * 30
    const thread = await prisma.chatThread.create({
      data: {
        subject: t.subject,
        lastMessageAt: new Date(base + t.messages.length * 36e5),
        participants: { create: [{ userId: clientId }, { userId: specialistId }] },
      },
    })
    for (const [i, m] of t.messages.entries()) {
      await prisma.message.create({
        data: {
          threadId: thread.id,
          senderId: m.fromClient ? clientId : specialistId,
          text: m.text,
          createdAt: new Date(base + i * 36e5),
        },
      })
    }
    if (t.order) {
      const agreed = new Date(base + 2 * 36e5)
      const delivered = new Date(Date.now() - 36e5 * 24)
      await prisma.order.create({
        data: {
          clientId,
          specialistId,
          threadId: thread.id,
          state: t.order.state,
          title: t.order.title,
          agreedAmountMin: t.order.min,
          agreedAmountMax: t.order.max,
          clientAgreedAt: agreed,
          specialistAgreedAt: agreed,
          deliveredAt: delivered,
          ...(t.order.state === 'DELIVERED'
            ? { autoConfirmAt: new Date(Date.now() + 6 * 864e5) }
            : { confirmedAt: delivered, completedAt: delivered }),
        },
      })
    }
  }

  // dealCasesCount — фактический
  for (const s of mockSpecialists) {
    const n = await prisma.case.count({
      where: { author: { id: userIdBySlug[s.slug]! }, dealType: { not: null }, status: 'PUBLISHED' },
    })
    if (n > 0) {
      await prisma.reviewAggregate.updateMany({
        where: { specialistProfile: { slug: s.slug } },
        data: { dealCasesCount: n },
      })
    }
  }

  const counts = {
    users: await prisma.user.count(),
    cases: await prisma.case.count(),
    images: await prisma.caseImage.count(),
    orders: await prisma.order.count(),
    reviews: await prisma.review.count(),
  }
  console.log('✓ Seed:', counts)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
