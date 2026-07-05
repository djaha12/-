/**
 * State machine заказа. Ключевой антифрод-инвариант: «сдан» предлагает специалист,
 * «завершён» подтверждает клиент (или авто-подтверждение по таймеру с уведомлением).
 * Отзыв возможен ТОЛЬКО из состояния completed.
 */
export type OrderStatus =
  | 'discussion' // обсуждение
  | 'agreed' // договорённость (обе стороны подтвердили условия)
  | 'in_progress' // в работе
  | 'delivered' // сдан специалистом, ждёт подтверждения клиента
  | 'completed' // завершён (подтвердил клиент или авто-подтверждение)
  | 'cancelled' // отменён
  | 'disputed' // спор, ждёт арбитража

export type OrderActor = 'client' | 'specialist' | 'system' | 'admin'

type Transition = { to: OrderStatus; by: OrderActor[] }

export const ORDER_TRANSITIONS: Record<OrderStatus, Transition[]> = {
  discussion: [
    // переход триггерит ВТОРОЕ подтверждение — любой стороной; взаимность
    // гарантируют поля clientAgreedAt/specialistAgreedAt на уровне API (docs/11 §2)
    { to: 'agreed', by: ['client', 'specialist'] },
    { to: 'cancelled', by: ['client', 'specialist'] },
  ],
  agreed: [
    { to: 'in_progress', by: ['specialist', 'system'] }, // system = автоматически с первым чек-поинтом
    { to: 'cancelled', by: ['client', 'specialist'] },
  ],
  in_progress: [
    { to: 'delivered', by: ['specialist'] },
    { to: 'cancelled', by: ['client', 'specialist'] },
    { to: 'disputed', by: ['client', 'specialist'] },
  ],
  delivered: [
    { to: 'completed', by: ['client', 'system'] }, // system = авто-подтверждение через N дней
    { to: 'disputed', by: ['client', 'specialist'] },
    { to: 'in_progress', by: ['client'] }, // клиент возвращает на доработку (≤3 возвратов, сбрасывает autoConfirmAt)
  ],
  completed: [], // терминальное; отзыв открывается здесь
  cancelled: [], // терминальное
  disputed: [
    { to: 'completed', by: ['admin'] },
    { to: 'cancelled', by: ['admin'] },
    { to: 'in_progress', by: ['admin'] },
  ],
}

export const TERMINAL_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set(['completed', 'cancelled'])

export function canTransitionOrder(
  from: OrderStatus,
  to: OrderStatus,
  actor: OrderActor,
): boolean {
  return ORDER_TRANSITIONS[from].some((t) => t.to === to && t.by.includes(actor))
}

/** Дней до авто-подтверждения «сдан» → «завершён», если клиент молчит */
export const AUTO_CONFIRM_DAYS = 7

/** Максимум возвратов «сдан» → «в работе» клиентом (docs/11 §2) */
export const MAX_DELIVERY_RETURNS = 3
