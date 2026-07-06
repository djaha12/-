/**
 * Модерация и trust-tiers (решение 03/4): новичок проходит премодерацию
 * первых кейсов, после порога одобрений становится TRUSTED и публикуется сразу.
 * Страйки: 3 нарушения = заморозка аккаунта (создание контента закрыто).
 */

export type TrustTier = 'NEW' | 'TRUSTED' | 'VERIFIED'

/** Сколько кейсов новичка проходят премодерацию до доверия */
export const PREMOD_CASES_COUNT = 3
/** Сколько страйков замораживают аккаунт */
export const STRIKES_TO_FREEZE = 3

/** Кейс этого автора публикуется через очередь модерации? */
export function needsPremoderation(trustTier: TrustTier): boolean {
  return trustTier === 'NEW'
}

/** Пора ли повышать новичка до TRUSTED (после очередного одобрения) */
export function shouldPromoteToTrusted(trustTier: TrustTier, approvedCasesCount: number): boolean {
  return trustTier === 'NEW' && approvedCasesCount >= PREMOD_CASES_COUNT
}

/** Замораживать ли аккаунт при таком числе страйков */
export function shouldFreeze(strikesCount: number): boolean {
  return strikesCount >= STRIKES_TO_FREEZE
}

/** Роли, которым открыта админка и действия модерации */
export function canModerate(role: string): boolean {
  return role === 'MODERATOR' || role === 'ADMIN'
}
