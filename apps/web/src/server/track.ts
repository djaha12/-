import 'server-only'
import { prisma, type Prisma } from '@atelier/db'

/**
 * Событийная аналитика через transactional outbox (schema: AnalyticsOutbox).
 * Внутри доменных транзакций — track(tx, …): событие атомарно с изменением.
 * Вне транзакций — trackSafe(…): аналитика никогда не роняет основной поток.
 * Доставка в PostHog — воркером после получения ключей (M7+); события копятся уже сейчас.
 */

type Db = Prisma.TransactionClient | typeof prisma

export function track(
  db: Db,
  eventName: string,
  actorId: string | null,
  props: Record<string, unknown> = {},
) {
  return db.analyticsOutbox.create({
    data: { eventName, actorId, props: props as Prisma.InputJsonValue },
  })
}

export async function trackSafe(
  eventName: string,
  actorId: string | null,
  props: Record<string, unknown> = {},
): Promise<void> {
  try {
    await track(prisma, eventName, actorId, props)
  } catch (e) {
    console.error('[analytics]', eventName, e)
  }
}
