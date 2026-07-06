import 'server-only'
import { prisma } from '@atelier/db'

/**
 * Честные пересчёты витрины специалиста. Вызываются после каждого события,
 * влияющего на репутацию: завершение заказа, отзыв, привязка кейса к заказу.
 * Никаких инкрементов вслепую — всегда полный пересчёт по фактам в БД.
 */

/** Витрина отзывов: средние по подшкалам + счётчик завершённых заказов */
export async function recalcReviewAggregate(specialistUserId: string) {
  const profile = await prisma.specialistProfile.findUnique({ where: { userId: specialistUserId } })
  if (!profile) return
  const reviews = await prisma.review.findMany({
    where: { specialistId: specialistUserId, hiddenAt: null, deletedAt: null },
    select: { scoreQuality: true, scoreTimeline: true, scoreCommunication: true, scoreBudget: true },
  })
  const n = reviews.length
  const avg = (pick: (r: (typeof reviews)[number]) => number) =>
    n ? reviews.reduce((s, r) => s + pick(r), 0) / n : 0
  const q = avg((r) => r.scoreQuality)
  const tl = avg((r) => r.scoreTimeline)
  const c = avg((r) => r.scoreCommunication)
  const b = avg((r) => r.scoreBudget)
  const completedOrders = await prisma.order.count({
    where: { specialistId: specialistUserId, state: 'COMPLETED' },
  })
  await prisma.reviewAggregate.update({
    where: { specialistProfileId: profile.id },
    data: {
      reviewsCount: n,
      avgQuality: q,
      avgTimeline: tl,
      avgCommunication: c,
      avgBudget: b,
      avgOverall: n ? (q + tl + c + b) / 4 : 0,
      completedOrdersCount: completedOrders,
      recalculatedAt: new Date(),
    },
  })
}

/** Риелторская витрина после привязки заказа к кейсу */
export async function recalcDealStats(specialistUserId: string) {
  const profile = await prisma.specialistProfile.findUnique({ where: { userId: specialistUserId } })
  if (!profile) return
  const confirmed = await prisma.case.findMany({
    where: {
      authorId: specialistUserId,
      dealConfirmedAt: { not: null },
      status: 'PUBLISHED',
      hiddenAt: null,
      deletedAt: null,
    },
    select: { daysOnMarket: true },
  })
  const dealCases = await prisma.case.count({
    where: { authorId: specialistUserId, dealType: { not: null }, status: 'PUBLISHED', deletedAt: null },
  })
  const days = confirmed
    .map((c) => c.daysOnMarket)
    .filter((d): d is number => d != null)
    .sort((a, b) => a - b)
  // порог честности медианы — 5 подтверждённых значений (docs/05 §5.4);
  // чётное n — среднее двух центральных (иначе смещение против риелтора)
  const median =
    days.length >= 5
      ? days.length % 2
        ? days[(days.length - 1) / 2]!
        : Math.round((days[days.length / 2 - 1]! + days[days.length / 2]!) / 2)
      : null
  await prisma.reviewAggregate.update({
    where: { specialistProfileId: profile.id },
    data: {
      confirmedDealsCount: confirmed.length,
      dealCasesCount: dealCases,
      medianDaysOnMarket: median,
    },
  })
}
