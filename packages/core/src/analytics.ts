/**
 * Таксономия ростовой аналитики (M8-инструментовка). Держим в core, потому что
 * значения — контракт между клиентским ?ref=, серверным событием lead_created и
 * дашбордом: расходятся строки — рушится атрибуция петли «визитка → заявка».
 */

/** Источник заявки — первое касание клиента (нормализуется из внешнего ?ref=). */
export const LEAD_SOURCES = [
  'direct', // прямой заход без метки
  'share', // клик по расшаренной ссылке (кнопка «Поделиться»)
  'story', // визитка-сторис (когда ссылка помечена story)
  'directory', // каталог специалистов
  'profile', // со страницы профиля
  'case', // со страницы кейса
  'brief', // из брифа/отклика
  'other', // неизвестная метка (защита от неограниченной кардинальности)
] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

/**
 * Нормализуем сырой ?ref= (управляется извне — ссылку может собрать кто угодно)
 * в известную корзину. Пусто → 'direct', неизвестное → 'other'. Регистр и
 * пробелы не важны. Так дашборд считает воронку по конечному набору значений,
 * а не по мусору из URL.
 */
export function normalizeLeadSource(raw: string | null | undefined): LeadSource {
  if (!raw) return 'direct'
  const v = raw.trim().toLowerCase()
  return (LEAD_SOURCES as readonly string[]).includes(v) ? (v as LeadSource) : 'other'
}

/** Способ шеринга (что сделал специалист) — для метрики share-rate петли §7.1. */
export const SHARE_METHODS = ['system', 'copy', 'story'] as const
export type ShareMethod = (typeof SHARE_METHODS)[number]

/** Поверхность шеринга — профиль или кейс. */
export const SHARE_SURFACES = ['case', 'profile'] as const
export type ShareSurface = (typeof SHARE_SURFACES)[number]
