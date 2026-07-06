import 'server-only'
import { canTransitionOrder } from '@atelier/core'
import { prisma } from '@atelier/db'
import { recalcReviewAggregate } from './aggregates'

/**
 * Авто-подтверждение сдачи: клиент не ответил 7 дней (AUTO_CONFIRM_DAYS) —
 * заказ завершается системой, как и обещает UI после «сдан».
 * Вызывается кроном (/api/cron/auto-confirm); идемпотентен.
 */
export async function runAutoConfirm(now = new Date()) {
  // инвариант перехода — из core: сдан → завершён разрешён системе
  if (!canTransitionOrder('delivered', 'completed', 'system')) {
    throw new Error('core запрещает system-переход delivered→completed — проверьте ORDER_TRANSITIONS')
  }
  const due = await prisma.order.findMany({
    where: { state: 'DELIVERED', autoConfirmAt: { lte: now } },
    select: { id: true, specialistId: true },
  })
  let completed = 0
  for (const o of due) {
    // оптимистическая блокировка: клиент мог подтвердить/вернуть на доработку между запросами
    const updated = await prisma.order.updateMany({
      where: { id: o.id, state: 'DELIVERED' },
      data: { state: 'COMPLETED', completedAt: now, confirmedAt: now, autoConfirmed: true },
    })
    if (updated.count === 0) continue
    await prisma.orderEvent.create({
      // byUserId null + reason — след системы для арбитража (append-only журнал)
      data: { orderId: o.id, fromState: 'DELIVERED', toState: 'COMPLETED', byUserId: null, reason: 'auto_confirm' },
    })
    await recalcReviewAggregate(o.specialistId)
    completed++
  }
  return { due: due.length, completed }
}
