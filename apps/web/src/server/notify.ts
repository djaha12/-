import 'server-only'
import { prisma, type Prisma } from '@atelier/db'
import { sendTelegramSafe } from './telegram'

/**
 * Уведомления M6. In-app центр (Notification) — источник истины; Telegram —
 * канал доставки (если привязан и настроен TELEGRAM_BOT_TOKEN). Доставка
 * fire-and-safe: сбой канала никогда не роняет доменный поток.
 * Сообщения чата НЕ уведомляем поштучно (шум); дайджест — вместе с PWA-push.
 */

export type NotificationType =
  | 'lead_new'
  | 'brief_response'
  | 'brief_accepted'
  | 'order_proposed'
  | 'order_agreed'
  | 'order_delivered'
  | 'order_completed'
  | 'order_cancelled'
  | 'review_new'
  | 'case_approved'
  | 'case_rejected'
  | 'content_hidden'

type Db = Prisma.TransactionClient | typeof prisma

export interface NotifyInput {
  title: string
  body?: string
  /** относительный url для перехода из центра уведомлений */
  url?: string
}

/** Создать in-app уведомление (внутри транзакции — передайте tx) */
export function createNotification(
  db: Db,
  userId: string,
  type: NotificationType,
  input: NotifyInput,
) {
  return db.notification.create({
    data: {
      userId,
      type,
      title: input.title,
      body: input.body ?? null,
      payload: input.url ? { url: input.url } : undefined,
    },
  })
}

/** Уведомить: in-app запись + попытка доставки в Telegram. Не бросает. */
export async function notifySafe(
  userId: string,
  type: NotificationType,
  input: NotifyInput,
): Promise<void> {
  try {
    const n = await createNotification(prisma, userId, type, input)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    })
    if (user?.telegramChatId) {
      const text = input.body ? `<b>${escapeHtml(input.title)}</b>\n${escapeHtml(input.body)}` : `<b>${escapeHtml(input.title)}</b>`
      const ok = await sendTelegramSafe(user.telegramChatId, text, input.url)
      if (ok) {
        await prisma.notification.update({
          where: { id: n.id },
          data: { telegramSentAt: new Date() },
        })
      }
    }
  } catch (e) {
    console.error('[notify]', type, e)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
