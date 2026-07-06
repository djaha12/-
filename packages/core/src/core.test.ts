import { describe, expect, it } from 'vitest'
import { canPublishCase, canRespondToBrief, quotaMonthStart } from './plans'
import { derivePriceRange } from './pricing'
import { canTransitionOrder, ORDER_TRANSITIONS, TERMINAL_ORDER_STATUSES, type OrderStatus } from './orders'
import { canSubmitReview, isValidScores, overallScore } from './reviews'
import { CONTACT_PLACEHOLDER, hideContacts } from './contacts'
import { canModerate, needsPremoderation, shouldFreeze, shouldPromoteToTrusted } from './moderation'

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
  it('«договорённость» триггерит второе подтверждение любой стороной, но не система/админ', () => {
    expect(canTransitionOrder('discussion', 'agreed', 'client')).toBe(true)
    expect(canTransitionOrder('discussion', 'agreed', 'specialist')).toBe(true)
    expect(canTransitionOrder('discussion', 'agreed', 'system')).toBe(false)
    expect(canTransitionOrder('discussion', 'agreed', 'admin')).toBe(false)
  })
  it('вернуть сданную работу на доработку может только клиент', () => {
    expect(canTransitionOrder('delivered', 'in_progress', 'client')).toBe(true)
    expect(canTransitionOrder('delivered', 'in_progress', 'specialist')).toBe(false)
  })
  it('спор по сданной работе может открыть любая сторона', () => {
    expect(canTransitionOrder('delivered', 'disputed', 'client')).toBe(true)
    expect(canTransitionOrder('delivered', 'disputed', 'specialist')).toBe(true)
  })
  it('старт работ: специалист или система (первый чек-поинт), но не клиент', () => {
    expect(canTransitionOrder('agreed', 'in_progress', 'specialist')).toBe(true)
    expect(canTransitionOrder('agreed', 'in_progress', 'system')).toBe(true)
    expect(canTransitionOrder('agreed', 'in_progress', 'client')).toBe(false)
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

describe('вилка цены — точная цена не раскрывается никогда', () => {
  it('обычная цена: floor/ceil в разные стороны', () => {
    const r = derivePriceRange(4_650_000)
    expect(r.min).toBeLessThan(4_650_000)
    expect(r.max).toBeGreaterThan(4_650_000)
  })
  it('малые суммы (аренда) не вырождаются в точку', () => {
    const r = derivePriceRange(30_000)
    expect(r.min).toBeLessThan(r.max)
    expect(r.min).not.toBe(30_000)
    expect(r.max).not.toBe(30_000)
  })
  it('круглые цены, равные шагу, тоже расширяются', () => {
    const r = derivePriceRange(10_000)
    expect(r.min).toBeLessThan(10_000)
    expect(r.max).toBeGreaterThan(10_000)
    expect(r.min).toBeGreaterThanOrEqual(0)
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
  it('окно отзыва — 90 дней от завершения', () => {
    expect(canSubmitReview({ ...base, orderStatus: 'completed', daysSinceCompleted: 90 }).allowed).toBe(true)
    expect(canSubmitReview({ ...base, orderStatus: 'completed', daysSinceCompleted: 91 }).allowed).toBe(false)
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

describe('автоскрытие контактов (решение 03/7)', () => {
  it('телефоны с кодом страны прячутся во всех написаниях', () => {
    for (const t of ['+996 555 123 456', '996555123456', '+996(555)12-34-56']) {
      expect(hideContacts(`Звоните: ${t}!`)).toBe(`Звоните: ${CONTACT_PLACEHOLDER}!`)
    }
  })
  it('локальный формат 0XXX-цифры прячется', () => {
    expect(hideContacts('мой номер 0555 12 34 56, жду')).toContain(CONTACT_PLACEHOLDER)
    expect(hideContacts('пишите на 0700123456')).toContain(CONTACT_PLACEHOLDER)
  })
  it('ники мессенджеров прячутся', () => {
    expect(hideContacts('телеграм @nurlan_kg — быстрее')).toContain(CONTACT_PLACEHOLDER)
  })
  it('цены, площади и даты НЕ трогаются', () => {
    const text = 'Квартира 58 м², дом 2012 года, продаю за 4 200 000 сом (торг до 4 600 000).'
    expect(hideContacts(text)).toBe(text)
  })
})

describe('окно квоты откликов', () => {
  it('начало месяца считается по Бишкеку (UTC+6)', () => {
    // 30 июня 23:00 UTC = 1 июля 05:00 Бишкека → окно июля уже открыто
    expect(quotaMonthStart(new Date('2026-06-30T23:00:00Z')).toISOString()).toBe(
      '2026-06-30T18:00:00.000Z',
    )
    // 30 июня 17:00 UTC = 30 июня 23:00 Бишкека → ещё июнь
    expect(quotaMonthStart(new Date('2026-06-30T17:00:00Z')).toISOString()).toBe(
      '2026-05-31T18:00:00.000Z',
    )
  })
})

describe('модерация и trust-tiers (решение 03/4)', () => {
  it('новичок проходит премодерацию, доверенные публикуются сразу', () => {
    expect(needsPremoderation('NEW')).toBe(true)
    expect(needsPremoderation('TRUSTED')).toBe(false)
    expect(needsPremoderation('VERIFIED')).toBe(false)
  })
  it('повышение до TRUSTED — после 3 одобренных кейсов', () => {
    expect(shouldPromoteToTrusted('NEW', 2)).toBe(false)
    expect(shouldPromoteToTrusted('NEW', 3)).toBe(true)
    expect(shouldPromoteToTrusted('TRUSTED', 100)).toBe(false)
  })
  it('3 страйка замораживают аккаунт', () => {
    expect(shouldFreeze(2)).toBe(false)
    expect(shouldFreeze(3)).toBe(true)
  })
  it('модерируют только MODERATOR и ADMIN', () => {
    expect(canModerate('MODERATOR')).toBe(true)
    expect(canModerate('ADMIN')).toBe(true)
    expect(canModerate('SPECIALIST')).toBe(false)
    expect(canModerate('CLIENT')).toBe(false)
  })
})
