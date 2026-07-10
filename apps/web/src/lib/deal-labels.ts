import type { DealInfo } from '@/mock/data'
import { fmt, type Dict } from '@/i18n/dictionaries'

/**
 * Локализуемые подписи сделки. Универсальный модуль (ни 'use client', ни
 * server-only): вызывается и серверной страницей кейса, и клиентской карточкой.
 */

export function dealTypeLabel(t: Dict, type: DealInfo['type']): string {
  return type === 'sale' ? t.caseCard.sale : type === 'rentOut' ? t.caseCard.rent : t.caseCard.pick
}

/** «Продано за 18 дней» — главный сигнал доверия на карточке сделки */
export function dealOutcomeLabel(t: Dict, deal: DealInfo): string | null {
  if (deal.type === 'sale' && deal.daysOnMarket) return fmt(t.caseCard.soldIn, { n: deal.daysOnMarket })
  if (deal.type === 'rentOut' && deal.daysOnMarket) return fmt(t.caseCard.rentedIn, { n: deal.daysOnMarket })
  if (deal.type === 'buyAssist') return t.caseCard.pickDone
  return null
}
