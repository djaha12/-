import 'server-only'
import { prisma } from '@atelier/db'
import { plural } from '@/lib/utils'
import { sendPushToUserSafe } from './push'
import { sendTelegramSafe } from './telegram'

/**
 * Ежедневный дайджест (M11): собирает непрочитанное с прошлого дайджеста —
 * in-app уведомления и сообщения чатов (их поштучно не шлём, см. notify.ts) —
 * и отправляет одной сводкой. Канал: Telegram, если привязан, иначе Web Push.
 * lastDigestAt двигается ТОЛЬКО при доставке — недоставленное не теряется
 * и попадёт в следующую сводку. Тексты ru — как все уведомления M6.
 */

const PAGE = 200
/** повторный запуск в тот же день не шлёт дважды: получившие ждут ≥20 часов */
const RESEND_AFTER_MS = 20 * 3600_000
/** бюджет прогона < maxDuration роута (60с), чтобы не резаться на полуслове */
const TIME_BUDGET_MS = 50_000

export interface DigestResult {
  candidates: number
  sent: number
}

export async function runDigest(now = new Date()): Promise<DigestResult> {
  const deadline = Date.now() + TIME_BUDGET_MS
  let candidates = 0
  let sent = 0

  // курсорный проход всей базы кандидатов — take без курсора навсегда
  // оставил бы юзеров за пределами первой страницы без дайджеста
  let cursor: string | undefined
  pages: while (Date.now() < deadline) {
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          { lastDigestAt: null },
          { lastDigestAt: { lt: new Date(now.getTime() - RESEND_AFTER_MS) } },
        ],
        AND: {
          OR: [{ telegramChatId: { not: null } }, { pushSubscriptions: { some: {} } }],
        },
      },
      select: {
        id: true,
        telegramChatId: true,
        createdAt: true,
        lastDigestAt: true,
      },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (users.length === 0) break
    cursor = users.at(-1)!.id

    for (const user of users) {
      if (Date.now() >= deadline) break pages
      const since = user.lastDigestAt ?? user.createdAt
      // непрочитанные in-app уведомления окна (lte now — край не задвоится завтра)
      const unreadNotifs = await prisma.notification.count({
        where: { userId: user.id, readAt: null, createdAt: { gt: since, lte: now } },
      })
      // непрочитанные чужие сообщения в незаглушённых тредах пользователя
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
            deletedAt: null,
            createdAt: { gt: p.lastReadAt && p.lastReadAt > since ? p.lastReadAt : since, lte: now },
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
        delivered = await sendTelegramSafe(user.telegramChatId, `<b>${title}</b>\n${body}`, url)
      }
      if (!delivered) {
        delivered = await sendPushToUserSafe(user.id, { title, body, url })
      }
      if (delivered) {
        await prisma.user.update({ where: { id: user.id }, data: { lastDigestAt: now } })
        sent++
      }
    }
  }

  return { candidates, sent }
}
