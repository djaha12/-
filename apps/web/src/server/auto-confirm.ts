import 'server-only'
import { canTransitionOrder } from '@atelier/core'
import { prisma } from '@atelier/db'
import { recalcReviewAggregate } from './aggregates'
import { notifySafe } from './notify'
import { track } from './track'

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
  // ограничиваем батч: не выйти за maxDuration лямбды при бэклоге;
  // остаток дочистится следующим прогоном крона (updateMany идемпотентен)
  const due = await prisma.order.findMany({
    where: { state: 'DELIVERED', autoConfirmAt: { lte: now } },
    select: { id: true, specialistId: true, clientId: true, title: true, threadId: true },
    orderBy: { autoConfirmAt: 'asc' },
    take: 200,
  })
  let completed = 0
  const touchedSpecialists = new Set<string>()
  for (const o of due) {
    try {
      // переход и журнал — одна транзакция (schema OrderEvent: append-only,
      // «пишется в той же транзакции, что переход»); оптимистическая блокировка —
      // клиент мог подтвердить/вернуть на доработку между запросами
      const claimed = await prisma.$transaction(async (tx) => {
        const u = await tx.order.updateMany({
          where: { id: o.id, state: 'DELIVERED' },
          data: { state: 'COMPLETED', completedAt: now, confirmedAt: now, autoConfirmed: true },
        })
        if (u.count === 1) {
          await tx.orderEvent.create({
            // byUserId null + reason — след системы для арбитража
            data: {
              orderId: o.id,
              fromState: 'DELIVERED',
              toState: 'COMPLETED',
              byUserId: null,
              reason: 'auto_confirm',
            },
          })
          await track(tx, 'order_completed', null, { orderId: o.id, auto: true })
        }
        return u.count
      })
      if (claimed === 1) {
        completed++
        touchedSpecialists.add(o.specialistId)
        const url = o.threadId ? `/messages/${o.threadId}` : undefined
        await notifySafe(o.clientId, 'order_completed', {
          title: 'Заказ завершён автоматически',
          body: `${o.title} — вы не ответили 7 дней после сдачи. Отзыв всё ещё можно оставить.`,
          url,
        })
        await notifySafe(o.specialistId, 'order_completed', {
          title: 'Заказ завершён (авто-подтверждение)',
          body: o.title,
          url,
        })
      }
    } catch (e) {
      // один сломанный заказ не роняет батч — дочистится следующим прогоном
      console.error(`[auto-confirm] заказ ${o.id}:`, e)
    }
  }
  for (const specialistId of touchedSpecialists) {
    await recalcReviewAggregate(specialistId)
  }
  return { due: due.length, completed }
}
