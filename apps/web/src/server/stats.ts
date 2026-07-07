import 'server-only'
import { prisma } from '@atelier/db'

/**
 * Дашборд владельца (M7.2). Воронка и контент считаются из доменных таблиц —
 * честные цифры с первого дня (не зависят от момента включения аналитики);
 * активность — из AnalyticsOutbox (distinct actorId по событиям платформы).
 */

export interface OwnerStats {
  users: { total: number; new30d: number; specialists: number; clients: number }
  activity: { actors7d: number; actors30d: number; events30d: number }
  funnel30d: {
    leads: number
    orders: number
    completed: number
    reviews: number
  }
  briefs30d: { created: number; responses: number; accepted: number }
  content: {
    published: number
    deals: number
    confirmed: number
    pendingQueue: number
    openReports: number
  }
  topDistricts: Array<{ name: string; confirmed: number }>
}

export async function getOwnerStats(): Promise<OwnerStats> {
  const now = Date.now()
  const d30 = new Date(now - 30 * 864e5)
  const d7 = new Date(now - 7 * 864e5)

  const [
    total,
    new30d,
    specialists,
    leads,
    orders,
    completed,
    reviews,
    briefsCreated,
    briefResponses,
    briefsAccepted,
    published,
    deals,
    confirmed,
    pendingQueue,
    openReports,
    events30d,
    actorRows30,
    actorRows7,
    districtGroups,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { createdAt: { gte: d30 }, deletedAt: null } }),
    prisma.specialistProfile.count({ where: { deletedAt: null } }),
    prisma.chatThread.count({ where: { createdAt: { gte: d30 } } }),
    prisma.order.count({ where: { createdAt: { gte: d30 } } }),
    prisma.order.count({ where: { completedAt: { gte: d30 } } }),
    prisma.review.count({ where: { createdAt: { gte: d30 }, deletedAt: null } }),
    prisma.brief.count({ where: { createdAt: { gte: d30 }, deletedAt: null } }),
    prisma.briefResponse.count({ where: { createdAt: { gte: d30 } } }),
    prisma.briefResponse.count({ where: { status: 'ACCEPTED', updatedAt: { gte: d30 } } }),
    prisma.case.count({ where: { status: 'PUBLISHED', hiddenAt: null, deletedAt: null } }),
    prisma.case.count({
      where: { status: 'PUBLISHED', hiddenAt: null, deletedAt: null, dealType: { not: null } },
    }),
    prisma.case.count({
      where: { dealConfirmedAt: { not: null }, status: 'PUBLISHED', hiddenAt: null, deletedAt: null },
    }),
    prisma.case.count({ where: { status: 'PENDING_REVIEW', deletedAt: null } }),
    prisma.report.count({ where: { status: 'OPEN' } }),
    prisma.analyticsOutbox.count({ where: { occurredAt: { gte: d30 } } }),
    prisma.analyticsOutbox.findMany({
      where: { occurredAt: { gte: d30 }, actorId: { not: null } },
      distinct: ['actorId'],
      select: { actorId: true },
    }),
    prisma.analyticsOutbox.findMany({
      where: { occurredAt: { gte: d7 }, actorId: { not: null } },
      distinct: ['actorId'],
      select: { actorId: true },
    }),
    prisma.case.groupBy({
      by: ['districtId'],
      where: {
        dealConfirmedAt: { not: null },
        status: 'PUBLISHED',
        hiddenAt: null,
        deletedAt: null,
        districtId: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { districtId: 'desc' } },
      take: 5,
    }),
  ])

  const districts = await prisma.district.findMany({
    where: { id: { in: districtGroups.map((g) => g.districtId!).filter(Boolean) } },
  })
  const districtName = new Map(districts.map((d) => [d.id, d.nameRu]))

  return {
    users: { total, new30d, specialists, clients: total - specialists },
    activity: { actors7d: actorRows7.length, actors30d: actorRows30.length, events30d },
    funnel30d: { leads, orders, completed, reviews },
    briefs30d: { created: briefsCreated, responses: briefResponses, accepted: briefsAccepted },
    content: { published, deals, confirmed, pendingQueue, openReports },
    topDistricts: districtGroups.map((g) => ({
      name: districtName.get(g.districtId!) ?? '—',
      confirmed: g._count._all,
    })),
  }
}
