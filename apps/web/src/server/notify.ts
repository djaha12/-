import 'server-only'
import { after } from 'next/server'
import { prisma, type Prisma } from '@atelier/db'
import { sendPushToUserSafe } from './push'
import { sendTelegramSafe } from './telegram'

/**
 * Уведомления M6 (+web-push M11). In-app центр (Notification) — источник
 * истины; Telegram и Web Push — каналы доставки (каждый включается своим env).
 * Доставка fire-and-safe: сбой канала никогда не роняет доменный поток.
 * Сообщения чата НЕ уведомляем поштучно (шум) — их собирает дайджест (M11).
 */

export type NotificationType =
  | 'lead_new'
  | 'brief_response'
  | 'brief_accepted'
  | 'order_proposed'
  | 'order_agreed'
  | 'order_delivered'
  | 'order_returned'
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

/** Уведомить: in-app запись сразу, доставка в Telegram и push — после ответа
 *  (after()), чтобы лежащие каналы не добавляли латентность мутациям. Не бросает. */
export async function notifySafe(
  userId: string,
  type: NotificationType,
  input: NotifyInput,
): Promise<void> {
  try {
    const n = await createNotification(prisma, userId, type, input)
    after(async () => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { telegramChatId: true },
        })
        if (user?.telegramChatId) {
          const text = input.body
            ? `<b>${escapeHtml(input.title)}</b>\n${escapeHtml(input.body)}`
            : `<b>${escapeHtml(input.title)}</b>`
          const ok = await sendTelegramSafe(user.telegramChatId, text, input.url)
          if (ok) {
            await prisma.notification.update({
              where: { id: n.id },
              data: { telegramSentAt: new Date() },
            })
          }
        }
      } catch (e) {
        console.error('[notify:telegram]', type, e)
      }
      try {
        const ok = await sendPushToUserSafe(userId, input)
        if (ok) {
          await prisma.notification.update({
            where: { id: n.id },
            data: { pushSentAt: new Date() },
          })
        }
      } catch (e) {
        console.error('[notify:push]', type, e)
      }
    })
  } catch (e) {
    console.error('[notify]', type, e)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
