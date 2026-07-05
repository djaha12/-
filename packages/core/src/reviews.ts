import type { OrderStatus } from './orders'

/** Окно подачи отзыва от completedAt (docs/03 §12) */
export const REVIEW_WINDOW_DAYS = 90
/** Окно редактирования уже оставленного отзыва, часов */
export const REVIEW_EDIT_WINDOW_HOURS = 72

export interface ReviewGateInput {
  orderStatus: OrderStatus
  /** автор отзыва — клиент именно этого заказа */
  reviewerIsOrderClient: boolean
  /** по заказу уже есть отзыв (unique-констрейнт в БД дублирует это правило) */
  alreadyReviewed: boolean
  /** полных дней с момента завершения заказа; undefined = только что */
  daysSinceCompleted?: number
}

export type ReviewGate = { allowed: true } | { allowed: false; reason: string }

/**
 * Антинакрутка by design: отзыв только по завершённому заказу,
 * только клиентом этого заказа, только один раз.
 */
export function canSubmitReview(input: ReviewGateInput): ReviewGate {
  if (input.orderStatus !== 'completed') {
    return {
      allowed: false,
      reason: 'Отзыв можно оставить после завершения заказа — когда вы подтвердите приёмку работы.',
    }
  }
  if (!input.reviewerIsOrderClient) {
    return { allowed: false, reason: 'Отзыв может оставить только клиент этого заказа.' }
  }
  if (input.alreadyReviewed) {
    return {
      allowed: false,
      reason: `По этому заказу отзыв уже оставлен. Его можно отредактировать в течение ${REVIEW_EDIT_WINDOW_HOURS} часов.`,
    }
  }
  if ((input.daysSinceCompleted ?? 0) > REVIEW_WINDOW_DAYS) {
    return {
      allowed: false,
      reason: `Отзыв можно оставить в течение ${REVIEW_WINDOW_DAYS} дней после завершения заказа.`,
    }
  }
  return { allowed: true }
}

export interface ReviewScores {
  quality: number
  timing: number
  communication: number
  budget: number
}

export function isValidScores(s: ReviewScores): boolean {
  return [s.quality, s.timing, s.communication, s.budget].every(
    (v) => Number.isInteger(v) && v >= 1 && v <= 5,
  )
}

export function overallScore(s: ReviewScores): number {
  return (s.quality + s.timing + s.communication + s.budget) / 4
}
