import 'server-only'
import { cache } from 'react'
import { canModerate, hideContacts, quotaMonthStart, PLAN_LIMITS } from '@atelier/core'
import { prisma, type Prisma, type Specialization } from '@atelier/db'
import type { CaseItem, DealInfo, DealType, MockImage, Review, Specialist } from '@/mock/data'

/**
 * Слой чтения M2/M3: возвращает DTO в форме мок-интерфейсов —
 * компоненты и страницы не знают о Prisma. Decimal → number, изображения → MockImage.
 */

const DEAL_TYPE_FROM_DB: Record<string, DealType> = {
  SALE: 'sale',
  RENT_OUT: 'rentOut',
  BUY_ASSIST: 'buyAssist',
  RENT_ASSIST: 'buyAssist',
}

const PROPERTY_LABEL: Record<string, string> = {
  APARTMENT: 'Вторичка',
  NEW_BUILD: 'Новостройка',
  HOUSE: 'Дом',
  COMMERCIAL: 'Коммерция',
  OFFICE: 'Офис',
  LAND: 'Участок',
  OTHER: 'Другое',
}

export const SPECIALIZATION_LABEL: Record<string, string> = {
  REALTOR: 'Риелтор',
  ARCHITECT: 'Архитектор',
  INTERIOR_DESIGNER: 'Дизайнер интерьера',
  LANDSCAPE_DESIGNER: 'Ландшафтный дизайнер',
  DECORATOR_STAGER: 'Хоумстейджер',
  VISUALIZER_3D: '3D-визуализатор',
  PHOTO_VIDEO: 'Фотограф недвижимости',
}

type ImageRow = { variants: Prisma.JsonValue; blurhash: string; width: number; height: number }

function toImage(row: ImageRow): MockImage {
  const variants = row.variants as { original?: string }
  return {
    src: variants.original ?? '',
    width: row.width,
    height: row.height,
    blurDataURL: row.blurhash,
  }
}

const caseInclude = {
  coverImage: true,
  district: true,
  city: true,
  styles: { include: { style: true } },
  author: { include: { specialistProfile: true } },
} satisfies Prisma.CaseInclude

type CaseRow = Prisma.CaseGetPayload<{ include: typeof caseInclude }>

function toDeal(row: CaseRow): DealInfo | undefined {
  if (!row.dealType) return undefined
  const exact = row.dealPriceVisibility === 'EXACT' ? (row.dealPriceSom ?? undefined) : undefined
  return {
    type: DEAL_TYPE_FROM_DB[row.dealType]!,
    propertyType: PROPERTY_LABEL[row.propertyType ?? 'OTHER']!,
    price: exact,
    priceFrom:
      row.dealPriceVisibility === 'RANGE' ? (row.dealPriceMinSom ?? undefined) : undefined,
    priceTo: row.dealPriceVisibility === 'RANGE' ? (row.dealPriceMaxSom ?? undefined) : undefined,
    daysOnMarket: row.daysOnMarket ?? undefined,
    confirmed: row.dealConfirmedAt != null,
  }
}

function toCaseItem(row: CaseRow): CaseItem {
  const location = [row.city?.nameRu, row.district?.nameRu].filter(Boolean).join(', ')
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    specialistSlug: row.author.specialistProfile?.slug ?? '',
    authorName: row.author.displayName ?? 'Специалист',
    location,
    styles: row.styles.map((s) => s.style.nameRu),
    areaM2: row.areaM2 ? Number(row.areaM2) : undefined,
    budgetFrom: row.budgetMin ?? 0,
    budgetTo: row.budgetMax ?? 0,
    saves: row.savesCount,
    image: row.coverImage
      ? toImage(row.coverImage)
      : { src: '', width: 4, height: 3, blurDataURL: '' },
    deal: toDeal(row),
  }
}

export interface FeedFilters {
  kind?: 'deals' | 'projects'
  districtSlug?: string
  confirmedOnly?: boolean
  q?: string
}

export async function getFeedCases(filters: FeedFilters = {}): Promise<CaseItem[]> {
  const where: Prisma.CaseWhereInput = {
    status: 'PUBLISHED',
    hiddenAt: null,
    deletedAt: null,
    ...(filters.kind === 'deals' ? { dealType: { not: null } } : {}),
    ...(filters.kind === 'projects' ? { dealType: null } : {}),
    ...(filters.districtSlug ? { district: { slug: filters.districtSlug } } : {}),
    ...(filters.confirmedOnly ? { dealConfirmedAt: { not: null } } : {}),
    ...(filters.q ? { title: { contains: filters.q, mode: 'insensitive' } } : {}),
  }
  const rows = await prisma.case.findMany({
    where,
    include: caseInclude,
    orderBy: { publishedAt: 'desc' },
    take: 40,
  })
  return rows.map(toCaseItem)
}

function toSpecialist(
  row: Prisma.SpecialistProfileGetPayload<{
    include: {
      user: true
      city: true
      styles: { include: { style: true } }
      expertiseDistricts: { include: { district: true } }
      reviewAggregate: true
    }
  }>,
): Specialist {
  const agg = row.reviewAggregate
  const isRealtor = row.specialization === 'REALTOR'
  const minutes = row.medianResponseMinutes ?? 120
  return {
    slug: row.slug,
    name: row.user.displayName ?? 'Специалист',
    profession: SPECIALIZATION_LABEL[row.specialization ?? ''] ?? 'Специалист',
    city: row.city?.nameRu ?? '',
    verified: row.identityVerifiedAt != null,
    rating: agg ? Number(agg.avgOverall) : 0,
    reviewsCount: agg?.reviewsCount ?? 0,
    projectsCount: agg?.completedOrdersCount ?? 0,
    repeatClientsPct: agg ? Math.round(Number(agg.repeatClientsPct)) : 0,
    responseTime:
      minutes < 60 ? `~${minutes} минут` : `~${Math.round(minutes / 60)} ч`,
    memberSince: String(row.createdAt.getFullYear()),
    styles: row.styles.map((s) => s.style.nameRu),
    priceFrom: row.priceMin ?? 0,
    priceTo: row.priceMax ?? 0,
    acceptsOrders: row.acceptsOrders,
    worksAt: row.worksAtLabel ?? undefined,
    bio: row.bio ?? '',
    dealStats:
      isRealtor && agg
        ? {
            closed: row.declaredDealsCount ?? agg.confirmedDealsCount,
            confirmed: agg.confirmedDealsCount,
            medianDaysOnMarket: agg.medianDaysOnMarket ?? 0,
            districts: row.expertiseDistricts.map((d) => d.district.nameRu),
          }
        : undefined,
  }
}

const specialistInclude = {
  user: true,
  city: true,
  styles: { include: { style: true } },
  expertiseDistricts: { include: { district: true } },
  reviewAggregate: true,
} satisfies Prisma.SpecialistProfileInclude

export interface SpecialistFilters {
  specialization?: string
  districtSlug?: string
  q?: string
}

export async function getSpecialists(
  filters: SpecialistFilters = {},
): Promise<Array<{ specialist: Specialist; thumbs: Array<{ id: string; title: string; image: MockImage }> }>> {
  // ?spec= приходит из URL — неизвестные значения молча игнорируем, не 500
  const spec =
    filters.specialization && filters.specialization in SPECIALIZATION_LABEL
      ? (filters.specialization as Specialization)
      : undefined
  const rows = await prisma.specialistProfile.findMany({
    where: {
      deletedAt: null,
      specialization: spec ?? { not: null },
      ...(filters.districtSlug
        ? { expertiseDistricts: { some: { district: { slug: filters.districtSlug } } } }
        : {}),
      ...(filters.q
        ? { user: { displayName: { contains: filters.q, mode: 'insensitive' } } }
        : {}),
    },
    include: specialistInclude,
    take: 60,
  })
  // миниатюры одним запросом на всех (не N+1), срез по 3 — в памяти
  const covers = await prisma.case.findMany({
    where: {
      authorId: { in: rows.map((r) => r.userId) },
      status: 'PUBLISHED',
      hiddenAt: null,
      deletedAt: null,
      coverImageId: { not: null },
    },
    include: { coverImage: true },
    orderBy: { publishedAt: 'desc' },
  })
  const byAuthor = new Map<string, typeof covers>()
  for (const c of covers) {
    const list = byAuthor.get(c.authorId) ?? []
    if (list.length < 3) {
      list.push(c)
      byAuthor.set(c.authorId, list)
    }
  }
  const result = rows.map((row) => ({
    specialist: toSpecialist(row),
    thumbs: (byAuthor.get(row.userId) ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      image: toImage(c.coverImage!),
    })),
  }))
  // риелторы первыми, пустые портфолио в конец, дальше рейтинг
  return result.sort((a, b) => {
    const aEmpty = a.thumbs.length === 0 ? 1 : 0
    const bEmpty = b.thumbs.length === 0 ? 1 : 0
    if (aEmpty !== bEmpty) return aEmpty - bEmpty
    const aR = a.specialist.dealStats ? 1 : 0
    const bR = b.specialist.dealStats ? 1 : 0
    if (aR !== bR) return bR - aR
    return b.specialist.rating - a.specialist.rating
  })
}

// cache(): metadata и страница профиля делят один запрос
export const getSpecialist = cache(async function getSpecialist(slug: string): Promise<
  | {
      specialist: Specialist
      cases: CaseItem[]
      reviews: Review[]
      coverImage: MockImage | null
    }
  | null
> {
  const row = await prisma.specialistProfile.findUnique({
    where: { slug },
    include: specialistInclude,
  })
  if (!row || row.deletedAt) return null

  const [caseRows, reviewRows] = await Promise.all([
    prisma.case.findMany({
      where: { authorId: row.userId, status: 'PUBLISHED', hiddenAt: null, deletedAt: null },
      include: caseInclude,
      orderBy: { publishedAt: 'desc' },
    }),
    prisma.review.findMany({
      where: { specialistId: row.userId, hiddenAt: null, deletedAt: null },
      include: { author: true, order: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ])

  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
  return {
    specialist: toSpecialist(row),
    cases: caseRows.map(toCaseItem),
    reviews: reviewRows.map((r) => ({
      id: r.id,
      author: r.author.displayName ?? 'Клиент',
      date: `${MONTHS[r.createdAt.getMonth()]} ${r.createdAt.getFullYear()}`,
      caseTitle: r.order.title,
      quality: r.scoreQuality,
      timing: r.scoreTimeline,
      communication: r.scoreCommunication,
      budget: r.scoreBudget,
      text: r.text ?? '',
    })),
    coverImage: null, // обложки профилей — задел M2.2; страница использует дефолт
  }
})

export interface CaseModerationNote {
  /** PENDING_REVIEW | REJECTED | HIDDEN — баннер статуса для автора */
  state: 'PENDING_REVIEW' | 'REJECTED' | 'HIDDEN'
  /** причина отклонения из ModerationItem.resolution */
  reason: string | null
}

// cache(): generateMetadata и страница делят один запрос в рамках рендера
export const getCase = cache(async function getCase(
  slug: string,
  viewer?: { id: string; role: string } | null,
): Promise<
  | {
      item: CaseItem
      author: Specialist
      /** авторский рассказ; отсутствует у кейсов без описания — секция скрывается */
      story: string[]
      gallery: MockImage[]
      beforeAfter: { before: MockImage; after: MockImage } | null
      review: Review | null
      related: CaseItem[]
      /** только для автора: кейс на проверке/отклонён/скрыт */
      moderation: CaseModerationNote | null
    }
  | null
> {
  const row = await prisma.case.findUnique({
    where: { slug },
    include: {
      ...caseInclude,
      images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!row || row.deletedAt) return null
  // публично виден только опубликованный и не скрытый; автору — любой его кейс;
  // модератору — тоже: премодерация «вслепую» по обложке из очереди невозможна
  const isAuthor = viewer != null && row.authorId === viewer.id
  const isModerator = viewer != null && canModerate(viewer.role)
  const publiclyVisible = row.status === 'PUBLISHED' && !row.hiddenAt
  if (!publiclyVisible && !isAuthor && !isModerator) return null

  let moderation: CaseModerationNote | null = null
  if (!publiclyVisible && (isAuthor || isModerator)) {
    const state = row.hiddenAt
      ? ('HIDDEN' as const)
      : row.status === 'REJECTED'
        ? ('REJECTED' as const)
        : ('PENDING_REVIEW' as const)
    const item =
      state === 'REJECTED'
        ? await prisma.moderationItem.findFirst({
            where: { entityType: 'CASE', entityId: row.id, status: 'REJECTED' },
            orderBy: { resolvedAt: 'desc' },
          })
        : null
    moderation = { state, reason: item?.resolution ?? null }
  }

  const profile = await prisma.specialistProfile.findUnique({
    where: { userId: row.authorId },
    include: specialistInclude,
  })
  if (!profile) return null

  const item = toCaseItem(row as unknown as CaseRow)
  const plain = row.images.filter((i) => !i.beforeAfterGroup)
  const before = row.images.find((i) => i.beforeAfterGroup && i.isBeforeImage)
  const after = row.images.find((i) => i.beforeAfterGroup && !i.isBeforeImage)

  const [reviewRow, relatedRows] = await Promise.all([
    prisma.review.findFirst({
      where: {
        specialistId: row.authorId,
        hiddenAt: null,
        deletedAt: null,
        // честная атрибуция: отзыв показываем только если он оставлен по заказу
        // ЭТОГО кейса (по названию — до появления Case↔Order связи в M4);
        // у неподтверждённой сделки отзывов не бывает by design
        order: { title: row.title, state: 'COMPLETED' },
        ...(item.deal && !item.deal.confirmed ? { id: 'never' } : {}),
      },
      include: { author: true, order: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.case.findMany({
      where: {
        id: { not: row.id },
        status: 'PUBLISHED',
        hiddenAt: null,
        deletedAt: null,
        dealType: item.deal ? { not: null } : null,
        ...(item.deal ? { authorId: row.authorId } : {}),
      },
      include: caseInclude,
      orderBy: { publishedAt: 'desc' },
      take: 4,
    }),
  ])

  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
  return {
    item,
    author: toSpecialist(profile),
    story: row.description
      ? row.description.split('\n\n').map((p) => p.trim()).filter(Boolean)
      : [],
    gallery: plain.map(toImage),
    beforeAfter: before && after ? { before: toImage(before), after: toImage(after) } : null,
    review: reviewRow
      ? {
          id: reviewRow.id,
          author: reviewRow.author.displayName ?? 'Клиент',
          date: `${MONTHS[reviewRow.createdAt.getMonth()]} ${reviewRow.createdAt.getFullYear()}`,
          caseTitle: reviewRow.order.title,
          quality: reviewRow.scoreQuality,
          timing: reviewRow.scoreTimeline,
          communication: reviewRow.scoreCommunication,
          budget: reviewRow.scoreBudget,
          text: reviewRow.text ?? '',
        }
      : null,
    related: relatedRows.map(toCaseItem),
    moderation,
  }
})

export async function getDistricts(): Promise<Array<{ slug: string; name: string }>> {
  const rows = await prisma.district.findMany({ orderBy: { nameRu: 'asc' } })
  return rows.map((d) => ({ slug: d.slug, name: d.nameRu }))
}

/** проставить savedByMe для залогиненного зрителя */
export async function markSaved<T extends { slug: string; savedByMe?: boolean }>(
  items: T[],
  viewerId: string | null | undefined,
): Promise<T[]> {
  if (!viewerId || items.length === 0) return items
  const saves = await prisma.save.findMany({
    where: { userId: viewerId, case: { slug: { in: items.map((i) => i.slug) } } },
    select: { case: { select: { slug: true } } },
  })
  const set = new Set(saves.map((s) => s.case.slug))
  return items.map((i) => ({ ...i, savedByMe: set.has(i.slug) }))
}

export interface ThreadListItem {
  id: string
  otherName: string
  otherSlug: string | null
  otherProfession: string | null
  subject: string | null
  lastText: string
  lastMine: boolean
  lastAt: Date | null
  orderState: string | null
  /** я — клиент этого заказа (для ролевых лейблов «ждёт вашего подтверждения») */
  orderMine: boolean
  unread: boolean
}

export async function getThreads(userId: string): Promise<ThreadListItem[]> {
  const rows = await prisma.chatThread.findMany({
    where: { participants: { some: { userId } } },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
    include: {
      participants: { include: { user: { include: { specialistProfile: true } } } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      orders: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
  return rows.map((t) => {
    const me = t.participants.find((p) => p.userId === userId)
    const other = t.participants.find((p) => p.userId !== userId)?.user
    const last = t.messages[0]
    const lastMine = last?.senderId === userId
    return {
      id: t.id,
      otherName: other?.displayName ?? 'Пользователь',
      otherSlug: other?.specialistProfile?.slug ?? null,
      otherProfession: other?.specialistProfile?.specialization
        ? (SPECIALIZATION_LABEL[other.specialistProfile.specialization] ?? null)
        : null,
      subject: t.subject,
      lastText: last?.text ?? '',
      lastMine,
      lastAt: t.lastMessageAt,
      orderState: t.orders[0]?.state ?? null,
      orderMine: t.orders[0]?.clientId === userId,
      unread:
        !lastMine &&
        t.lastMessageAt != null &&
        (me?.lastReadAt == null || me.lastReadAt < t.lastMessageAt),
    }
  })
}

export async function getThreadHeader(
  threadId: string,
  userId: string,
): Promise<{ id: string; otherName: string; otherSlug: string | null; otherProfession: string | null; subject: string | null } | null> {
  const t = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: { participants: { include: { user: { include: { specialistProfile: true } } } } },
  })
  if (!t || !t.participants.some((p) => p.userId === userId)) return null
  const other = t.participants.find((p) => p.userId !== userId)?.user
  return {
    id: t.id,
    otherName: other?.displayName ?? 'Пользователь',
    otherSlug: other?.specialistProfile?.slug ?? null,
    otherProfession: other?.specialistProfile?.specialization
      ? (SPECIALIZATION_LABEL[other.specialistProfile.specialization] ?? null)
      : null,
    subject: t.subject,
  }
}

export async function getSavedCases(viewerId: string): Promise<CaseItem[]> {
  const rows = await prisma.save.findMany({
    where: { userId: viewerId, case: { status: 'PUBLISHED', hiddenAt: null, deletedAt: null } },
    include: { case: { include: caseInclude } },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map((s) => ({ ...toCaseItem(s.case as CaseRow), savedByMe: true }))
}

/* ============================================================================
 * M4.5: брифы — чтение. Лента открытых задач для специалистов,
 * «мои брифы» для клиента, ролевая страница брифа.
 * ==========================================================================*/

export const BRIEF_OBJECT_LABEL: Record<string, string> = {
  APARTMENT: 'Квартира',
  NEW_BUILD: 'Новостройка',
  HOUSE: 'Дом',
  COMMERCIAL: 'Коммерция',
  OFFICE: 'Офис',
  LAND: 'Участок',
  OTHER: 'Другое',
}

export interface BriefListItem {
  id: string
  title: string
  description: string
  objectTypeLabel: string
  districtName: string | null
  budgetMin: number | null
  budgetMax: number | null
  status: string
  createdAt: Date
  responsesCount: number
  /** для ленты специалиста: я уже откликнулся */
  iResponded: boolean
}

function toBriefListItem(
  row: Prisma.BriefGetPayload<{
    include: { district: true; _count: { select: { responses: true } } }
  }> & { responses?: Array<{ id: string }> },
): BriefListItem {
  return {
    id: row.id,
    title: hideContacts(row.title),
    // автоскрытие контактов (решение 03/7) — на чтении, оригинал в БД не трогаем
    description: hideContacts(row.description ?? ''),
    objectTypeLabel: BRIEF_OBJECT_LABEL[row.objectType] ?? 'Другое',
    districtName: row.district?.nameRu ?? null,
    budgetMin: row.budgetMin,
    budgetMax: row.budgetMax,
    status: row.status,
    createdAt: row.createdAt,
    responsesCount: row._count.responses,
    iResponded: (row.responses?.length ?? 0) > 0,
  }
}

/** Лента открытых брифов для специалиста */
export async function getOpenBriefs(viewerId: string): Promise<BriefListItem[]> {
  const rows = await prisma.brief.findMany({
    where: { status: 'OPEN', deletedAt: null, clientId: { not: viewerId } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      district: true,
      _count: { select: { responses: true } },
      responses: { where: { specialistId: viewerId }, select: { id: true } },
    },
  })
  return rows.map(toBriefListItem)
}

/** Брифы клиента (владельца) */
export async function getMyBriefs(viewerId: string): Promise<BriefListItem[]> {
  const rows = await prisma.brief.findMany({
    where: { clientId: viewerId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { district: true, _count: { select: { responses: true } } },
  })
  return rows.map(toBriefListItem)
}

export interface BriefResponseItem {
  id: string
  status: string
  message: string
  priceEstimate: number | null
  createdAt: Date
  specialist: {
    name: string
    slug: string | null
    profession: string
    verified: boolean
    rating: number
    reviewsCount: number
  }
  cases: Array<{ slug: string; title: string; image: MockImage }>
}

export type BriefView =
  | { role: 'owner'; brief: BriefListItem; responses: BriefResponseItem[] }
  | {
      role: 'specialist'
      brief: BriefListItem & { clientName: string }
      myResponse: BriefResponseItem | null
      /** мои опубликованные кейсы для формы отклика */
      myCases: Array<{ slug: string; title: string; image: MockImage }>
      quota: { used: number; limit: number }
    }

const responseInclude = {
  specialist: { include: { specialistProfile: { include: { reviewAggregate: true } } } },
  cases: {
    orderBy: { sortOrder: 'asc' },
    include: { case: { include: { coverImage: true } } },
  },
} satisfies Prisma.BriefResponseInclude

function toResponseItem(
  row: Prisma.BriefResponseGetPayload<{ include: typeof responseInclude }>,
): BriefResponseItem {
  const profile = row.specialist.specialistProfile
  const agg = profile?.reviewAggregate
  return {
    id: row.id,
    status: row.status,
    // контакты в отклике — только через чат (решение 03/7)
    message: hideContacts(row.message),
    priceEstimate: row.priceEstimate,
    createdAt: row.createdAt,
    specialist: {
      name: row.specialist.displayName ?? 'Специалист',
      slug: profile?.slug ?? null,
      profession: SPECIALIZATION_LABEL[profile?.specialization ?? ''] ?? 'Специалист',
      verified: profile?.identityVerifiedAt != null,
      rating: agg ? Number(agg.avgOverall) : 0,
      reviewsCount: agg?.reviewsCount ?? 0,
    },
    cases: row.cases
      .filter((c) => c.case.status === 'PUBLISHED' && !c.case.deletedAt && !c.case.hiddenAt)
      .map((c) => ({
        slug: c.case.slug,
        title: c.case.title,
        image: c.case.coverImage
          ? toImage(c.case.coverImage)
          : { src: '', width: 4, height: 3, blurDataURL: '' },
      })),
  }
}

/**
 * Ролевая страница брифа: владелец видит отклики (и помечает их просмотренными),
 * специалист — задачу и свой отклик/форму. Посторонним клиентам бриф не показывается.
 */
export async function getBriefView(briefId: string, viewerId: string): Promise<BriefView | null> {
  const row = await prisma.brief.findUnique({
    where: { id: briefId },
    include: {
      district: true,
      client: true,
      _count: { select: { responses: true } },
    },
  })
  if (!row || row.deletedAt) return null

  if (row.clientId === viewerId) {
    // честный сигнал специалисту: клиент открыл отклики → «просмотрен»
    const now = new Date()
    await prisma.$transaction([
      prisma.briefResponse.updateMany({
        where: { briefId, viewedAt: null },
        data: { viewedAt: now },
      }),
      prisma.briefResponse.updateMany({
        where: { briefId, status: 'SENT' },
        data: { status: 'VIEWED' },
      }),
    ])
    const responses = await prisma.briefResponse.findMany({
      where: { briefId },
      orderBy: { createdAt: 'asc' },
      include: responseInclude,
    })
    return {
      role: 'owner',
      brief: toBriefListItem(row),
      responses: responses.map(toResponseItem),
    }
  }

  // не владелец: бриф видят только специалисты
  const myProfile = await prisma.specialistProfile.findUnique({ where: { userId: viewerId } })
  if (!myProfile) return null

  const [myResponseRow, myCases, monthUsed] = await Promise.all([
    prisma.briefResponse.findUnique({
      where: { briefId_specialistId: { briefId, specialistId: viewerId } },
      include: responseInclude,
    }),
    prisma.case.findMany({
      where: { authorId: viewerId, status: 'PUBLISHED', hiddenAt: null, deletedAt: null },
      include: { coverImage: true },
      orderBy: { publishedAt: 'desc' },
      take: 12,
    }),
    prisma.briefResponse.count({
      // то же окно, что в мутации respond — единый helper из core
      where: { specialistId: viewerId, createdAt: { gte: quotaMonthStart() } },
    }),
  ])

  return {
    role: 'specialist',
    brief: { ...toBriefListItem(row), clientName: row.client.displayName ?? 'Клиент' },
    myResponse: myResponseRow ? toResponseItem(myResponseRow) : null,
    myCases: myCases.map((c) => ({
      slug: c.slug,
      title: c.title,
      image: c.coverImage
        ? toImage(c.coverImage)
        : { src: '', width: 4, height: 3, blurDataURL: '' },
    })),
    quota: { used: monthUsed, limit: PLAN_LIMITS.FREE.maxBriefResponsesPerMonth },
  }
}

/* ============================================================================
 * M5: очередь модерации для /admin (MODERATOR/ADMIN).
 * ==========================================================================*/

export const REPORT_REASON_LABEL: Record<string, string> = {
  STOLEN_CONTENT: 'Украденный контент',
  SPAM: 'Спам',
  CONTACTS_IN_PUBLIC: 'Контакты в описании',
  OFFENSIVE: 'Оскорбительный контент',
  FAKE: 'Недостоверно',
  FALSE_AFFILIATION: 'Ложная принадлежность',
  FRAUD: 'Мошенничество',
  OTHER: 'Другое',
}

export interface PendingCaseItem {
  id: string
  slug: string
  title: string
  authorName: string
  isDeal: boolean
  districtName: string | null
  createdAt: Date
  image: MockImage
}

export interface OpenReportItem {
  id: string
  reasonLabel: string
  comment: string | null
  reporterName: string
  createdAt: Date
  target: { type: 'CASE' | 'REVIEW'; title: string; href: string | null } | null
}

export async function getModerationQueue(): Promise<{
  pendingCases: PendingCaseItem[]
  openReports: OpenReportItem[]
}> {
  const [cases, reports] = await Promise.all([
    prisma.case.findMany({
      where: { status: 'PENDING_REVIEW', deletedAt: null },
      include: { coverImage: true, district: true, author: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    }),
    prisma.report.findMany({
      where: { status: 'OPEN' },
      include: { reporter: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    }),
  ])

  // цели жалоб — батчем, без N+1
  const caseIds = reports.filter((r) => r.targetType === 'CASE').map((r) => r.targetId)
  const reviewIds = reports.filter((r) => r.targetType === 'REVIEW').map((r) => r.targetId)
  const [targetCases, targetReviews] = await Promise.all([
    caseIds.length
      ? prisma.case.findMany({ where: { id: { in: caseIds } }, include: { author: true } })
      : Promise.resolve([]),
    reviewIds.length
      ? prisma.review.findMany({ where: { id: { in: reviewIds } }, include: { author: true } })
      : Promise.resolve([]),
  ])
  const caseById = new Map(targetCases.map((c) => [c.id, c]))
  const reviewById = new Map(targetReviews.map((r) => [r.id, r]))

  return {
    pendingCases: cases.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      authorName: c.author.displayName ?? 'Специалист',
      isDeal: c.dealType != null,
      districtName: c.district?.nameRu ?? null,
      createdAt: c.createdAt,
      image: c.coverImage
        ? toImage(c.coverImage)
        : { src: '', width: 4, height: 3, blurDataURL: '' },
    })),
    openReports: reports.map((r) => {
      let target: OpenReportItem['target'] = null
      if (r.targetType === 'CASE') {
        const c = caseById.get(r.targetId)
        target = c
          ? {
              type: 'CASE',
              title: `${c.title} — ${c.author.displayName ?? 'Специалист'}`,
              href: c.hiddenAt ? null : `/case/${c.slug}`,
            }
          : { type: 'CASE', title: 'Кейс удалён', href: null }
      } else if (r.targetType === 'REVIEW') {
        const rv = reviewById.get(r.targetId)
        target = rv
          ? {
              type: 'REVIEW',
              title: `Отзыв ${rv.author.displayName ?? 'клиента'}: «${(rv.text ?? '').slice(0, 80)}…»`,
              href: null,
            }
          : { type: 'REVIEW', title: 'Отзыв удалён', href: null }
      }
      return {
        id: r.id,
        reasonLabel: REPORT_REASON_LABEL[r.reason] ?? r.reason,
        comment: r.comment,
        reporterName: r.reporter?.displayName ?? 'Гость',
        createdAt: r.createdAt,
        target,
      }
    }),
  }
}
