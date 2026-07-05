import { describe, expect, it } from 'vitest'
import { canPublishCase, canRespondToBrief } from './plans'
import { canTransitionOrder, ORDER_TRANSITIONS, TERMINAL_ORDER_STATUSES, type OrderStatus } from './orders'
import { canSubmitReview, isValidScores, overallScore } from './reviews'

describe('лимиты тарифов', () => {
  it('Free: 5-й опубликованный кейс — последний разрешённый', () => {
    expect(canPublishCase('FREE', 4).allowed).toBe(true)
    expect(canPublishCase('FREE', 5).allowed).toBe(false)
  })
  it('PRO: без лимита кейсов', () => {
    expect(canPublishCase('PRO', 500).allowed).toBe(true)
  })
  it('Free: лимит откликов на брифы в месяц', () => {
    expect(canRespondToBrief('FREE', 9).allowed).toBe(true)
    expect(canRespondToBrief('FREE', 10).allowed).toBe(false)
    expect(canRespondToBrief('PRO', 10_000).allowed).toBe(true)
  })
  it('отказ всегда объясняет причину человеческим языком', () => {
    const check = canPublishCase('FREE', 5)
    expect(check.allowed).toBe(false)
    if (!check.allowed) expect(check.reason).toMatch(/PRO/)
  })
})

describe('state machine заказа', () => {
  it('«сдан» может отметить только специалист', () => {
    expect(canTransitionOrder('in_progress', 'delivered', 'specialist')).toBe(true)
    expect(canTransitionOrder('in_progress', 'delivered', 'client')).toBe(false)
  })
  it('«завершён» подтверждает клиент или система (авто-таймер), но не специалист', () => {
    expect(canTransitionOrder('delivered', 'completed', 'client')).toBe(true)
    expect(canTransitionOrder('delivered', 'completed', 'system')).toBe(true)
    expect(canTransitionOrder('delivered', 'completed', 'specialist')).toBe(false)
  })
  it('условия подтверждает клиент — специалист не может сам «договориться»', () => {
    expect(canTransitionOrder('discussion', 'agreed', 'client')).toBe(true)
    expect(canTransitionOrder('discussion', 'agreed', 'specialist')).toBe(false)
  })
  it('спор разруливает только админ', () => {
    expect(canTransitionOrder('disputed', 'completed', 'admin')).toBe(true)
    expect(canTransitionOrder('disputed', 'completed', 'client')).toBe(false)
    expect(canTransitionOrder('disputed', 'cancelled', 'specialist')).toBe(false)
  })
  it('терминальные состояния не имеют выходов', () => {
    for (const s of TERMINAL_ORDER_STATUSES) {
      expect(ORDER_TRANSITIONS[s]).toHaveLength(0)
    }
  })
  it('нельзя перепрыгнуть из обсуждения сразу в завершён (фейковый заказ)', () => {
    const actors = ['client', 'specialist', 'system', 'admin'] as const
    for (const a of actors) {
      expect(canTransitionOrder('discussion', 'completed', a)).toBe(false)
      expect(canTransitionOrder('agreed', 'completed', a)).toBe(false)
    }
  })
})

describe('отзывы — антинакрутка by design', () => {
  const base = { reviewerIsOrderClient: true, alreadyReviewed: false }

  it('отзыв без завершённого заказа невозможен — ни в одном другом статусе', () => {
    const nonCompleted: OrderStatus[] = ['discussion', 'agreed', 'in_progress', 'delivered', 'cancelled', 'disputed']
    for (const orderStatus of nonCompleted) {
      expect(canSubmitReview({ ...base, orderStatus }).allowed).toBe(false)
    }
    expect(canSubmitReview({ ...base, orderStatus: 'completed' }).allowed).toBe(true)
  })
  it('отзыв может оставить только клиент заказа', () => {
    expect(
      canSubmitReview({ orderStatus: 'completed', reviewerIsOrderClient: false, alreadyReviewed: false }).allowed,
    ).toBe(false)
  })
  it('второй отзыв по тому же заказу невозможен', () => {
    expect(
      canSubmitReview({ orderStatus: 'completed', reviewerIsOrderClient: true, alreadyReviewed: true }).allowed,
    ).toBe(false)
  })
  it('подшкалы: целые 1–5', () => {
    expect(isValidScores({ quality: 5, timing: 4, communication: 5, budget: 3 })).toBe(true)
    expect(isValidScores({ quality: 0, timing: 4, communication: 5, budget: 3 })).toBe(false)
    expect(isValidScores({ quality: 4.5, timing: 4, communication: 5, budget: 3 })).toBe(false)
    expect(isValidScores({ quality: 6, timing: 4, communication: 5, budget: 3 })).toBe(false)
  })
  it('общая оценка — среднее четырёх подшкал', () => {
    expect(overallScore({ quality: 5, timing: 4, communication: 5, budget: 4 })).toBe(4.5)
  })
})
