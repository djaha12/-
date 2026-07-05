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
    reason: `На тарифе Free можно опубликовать до ${limit} кейсов. Переведите кейс в архив или подключите PRO.`,
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
