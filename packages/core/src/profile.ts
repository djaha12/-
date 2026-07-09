/**
 * Инварианты профиля специалиста (онбординг M6.2).
 */

/**
 * Районы экспертизы (docs/05 §5.4): специалист заявляет сам, максимум 5 —
 * фокус вместо «работаю везде» (широта размывает доверие и фильтр каталога).
 */
export const MAX_EXPERTISE_DISTRICTS = 5

export type DistrictsCheck = { allowed: true } | { allowed: false; reason: string }

export function canSelectExpertiseDistricts(count: number): DistrictsCheck {
  if (count <= MAX_EXPERTISE_DISTRICTS) return { allowed: true }
  return {
    allowed: false,
    reason: `Выберите до ${MAX_EXPERTISE_DISTRICTS} районов — фокус вызывает больше доверия, чем «работаю везде».`,
  }
}
