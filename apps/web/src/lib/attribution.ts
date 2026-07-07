/**
 * Атрибуция петли «визитка → заявка» (M8). Расшаренная ссылка несёт ?ref=,
 * мы фиксируем его при входе (первое касание) и прикладываем к заявке. Живёт в
 * sessionStorage: переживает переход кейс → заявка и раунд логина в той же
 * вкладке, не протягивая параметр через каждую ссылку.
 */

export const REF_PARAM = 'ref'
const KEY = 'atelier_ref'

/** Сохранить ?ref= из текущего URL один раз за сессию (первое касание). */
export function captureRef(): void {
  if (typeof window === 'undefined') return
  try {
    const ref = new URLSearchParams(window.location.search).get(REF_PARAM)
    if (ref && !sessionStorage.getItem(KEY)) {
      sessionStorage.setItem(KEY, ref.slice(0, 32))
    }
  } catch {
    /* приватный режим / переполнена квота — атрибуция необязательна, не мешаем */
  }
}

/** Прочитать зафиксированный источник (или null). Сервер нормализует значение. */
export function readRef(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}
