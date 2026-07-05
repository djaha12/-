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
    { to: 'agreed', by: ['client'] }, // условия предлагает специалист, подтверждает клиент
    { to: 'cancelled', by: ['client', 'specialist'] },
  ],
  agreed: [
    { to: 'in_progress', by: ['specialist'] },
    { to: 'cancelled', by: ['client', 'specialist'] },
  ],
  in_progress: [
    { to: 'delivered', by: ['specialist'] },
    { to: 'cancelled', by: ['client', 'specialist'] },
    { to: 'disputed', by: ['client', 'specialist'] },
  ],
  delivered: [
    { to: 'completed', by: ['client', 'system'] }, // system = авто-подтверждение через N дней
    { to: 'disputed', by: ['client'] },
    { to: 'in_progress', by: ['specialist'] }, // вернуть в работу по замечаниям
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
