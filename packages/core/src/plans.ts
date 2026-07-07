export type Plan = 'FREE' | 'PRO'

export const PLAN_LIMITS: Record<Plan, { maxPublishedCases: number; maxBriefResponsesPerMonth: number }> = {
  FREE: { maxPublishedCases: 5, maxBriefResponsesPerMonth: 10 },
  PRO: { maxPublishedCases: Infinity, maxBriefResponsesPerMonth: Infinity },
}

export type LimitCheck = { allowed: true } | { allowed: false; reason: string }

/** Лимит Free: 5 опубликованных кейсов. Черновики не считаются. */
export function canPublishCase(plan: Plan, publishedCasesCount: number): LimitCheck {
  const limit = PLAN_LIMITS[plan].maxPublishedCases
  if (publishedCasesCount < limit) return { allowed: true }
  return {
    allowed: false,
    reason: `На тарифе Free можно опубликовать до ${limit} кейсов. Подключите PRO — лимит снимется.`,
  }
}

/**
 * PRO→Free даунгрейд: уже опубликованные кейсы НЕ скрываем (доверие важнее),
 * но публиковать новые сверх лимита нельзя.
 */
export function canRespondToBrief(plan: Plan, responsesThisMonth: number): LimitCheck {
  const limit = PLAN_LIMITS[plan].maxBriefResponsesPerMonth
  if (responsesThisMonth < limit) return { allowed: true }
  return {
    allowed: false,
    reason: `Лимит откликов на Free — ${limit} в месяц. Новые отклики будут доступны с началом месяца или на PRO.`,
  }
}

/**
 * Начало календарного месяца по Бишкеку (UTC+6) — единое окно квоты откликов
 * для мутации и показа остатка. На UTC-сервере граница месяца иначе съезжает на 6 ч.
 */
export function quotaMonthStart(now: Date = new Date(), tzOffsetMinutes = 6 * 60): Date {
  const shifted = new Date(now.getTime() + tzOffsetMinutes * 60_000)
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - tzOffsetMinutes * 60_000,
  )
}
