import 'server-only'
import { prisma } from '@atelier/db'
import { sendPushToUserSafe } from './push'
import { sendTelegramSafe } from './telegram'

/**
 * Ежедневный дайджест (M11): собирает непрочитанное с прошлого дайджеста —
 * in-app уведомления и сообщения чатов (их поштучно не шлём, см. notify.ts) —
 * и отправляет одной сводкой. Канал: Telegram, если привязан, иначе Web Push.
 * lastDigestAt двигается ТОЛЬКО при доставке — недоставленное не теряется
 * и попадёт в следующую сводку. Тексты ru — как все уведомления M6.
 */

const BATCH = 200
/** не дёргаем тех, кто уже видел всё сам: свежее непрочитанного нет — молчим */
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export interface DigestResult {
  candidates: number
  sent: number
}

export async function runDigest(now = new Date()): Promise<DigestResult> {
  // кандидаты: есть куда доставлять (TG или push-подписка) и аккаунт живой
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      OR: [{ telegramChatId: { not: null } }, { pushSubscriptions: { some: {} } }],
    },
    select: {
      id: true,
      telegramChatId: true,
      createdAt: true,
      lastDigestAt: true,
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH,
  })

  let candidates = 0
  let sent = 0
  for (const user of users) {
    const since = user.lastDigestAt ?? user.createdAt
    // непрочитанные in-app уведомления, появившиеся после прошлого дайджеста
    const unreadNotifs = await prisma.notification.count({
      where: { userId: user.id, readAt: null, createdAt: { gt: since } },
    })
    // непрочитанные чужие сообщения в тредах пользователя (не заглушённых)
    const participations = await prisma.chatParticipant.findMany({
      where: {
        userId: user.id,
        OR: [{ mutedUntil: null }, { mutedUntil: { lt: now } }],
      },
      select: { threadId: true, lastReadAt: true },
    })
    let unreadMessages = 0
    let threadsWithUnread = 0
    for (const p of participations) {
      const cnt = await prisma.message.count({
        where: {
          threadId: p.threadId,
          senderId: { not: user.id },
          createdAt: { gt: p.lastReadAt && p.lastReadAt > since ? p.lastReadAt : since },
        },
      })
      if (cnt > 0) {
        unreadMessages += cnt
        threadsWithUnread++
      }
    }

    if (unreadNotifs === 0 && unreadMessages === 0) continue
    candidates++

    const parts: string[] = []
    if (unreadMessages > 0)
      parts.push(
        `${unreadMessages} ${plural(unreadMessages, 'новое сообщение', 'новых сообщения', 'новых сообщений')} в ${threadsWithUnread} ${plural(threadsWithUnread, 'чате', 'чатах', 'чатах')}`,
      )
    if (unreadNotifs > 0)
      parts.push(
        `${unreadNotifs} ${plural(unreadNotifs, 'непрочитанное уведомление', 'непрочитанных уведомления', 'непрочитанных уведомлений')}`,
      )
    const title = 'Пока вас не было на Ателье'
    const body = parts.join(' и ')
    const url = unreadMessages > 0 ? '/messages' : '/notifications'

    let delivered = false
    if (user.telegramChatId) {
      delivered = await sendTelegramSafe(
        user.telegramChatId,
        `<b>${title}</b>\n${body}`,
        url,
      )
    }
    if (!delivered) {
      delivered = await sendPushToUserSafe(user.id, { title, body, url })
    }
    if (delivered) {
      await prisma.user.update({ where: { id: user.id }, data: { lastDigestAt: now } })
      sent++
    }
  }

  return { candidates, sent }
}
