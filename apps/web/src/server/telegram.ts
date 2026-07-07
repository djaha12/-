import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { SITE_URL } from '@/lib/site'

/**
 * Telegram-канал уведомлений (M6). Бот работает вебхуком — long-polling и
 * отдельный сервис не нужны. Без TELEGRAM_BOT_TOKEN всё деградирует тихо:
 * in-app центр работает, доставка в TG пропускается.
 *
 * Привязка: /settings/notifications выдаёт deep-link t.me/<bot>?start=<токен>;
 * токен — подписанный userId (HMAC), хранить нечего, истекать нечему —
 * привязка идемпотентна и заменяет прошлую.
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const LINK_SECRET =
  process.env.TELEGRAM_LINK_SECRET ?? process.env.CRON_SECRET ?? 'atelier-tg-dev'

export const TELEGRAM_BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT ?? null

function sign(userId: string): string {
  return createHmac('sha256', LINK_SECRET).update(userId).digest('hex').slice(0, 16)
}

/** Токен привязки для deep-link /start */
export function makeLinkToken(userId: string): string {
  return `${userId}-${sign(userId)}`
}

/** Проверка токена из /start; вернёт userId или null */
export function verifyLinkToken(token: string): string | null {
  const i = token.lastIndexOf('-')
  if (i <= 0) return null
  const userId = token.slice(0, i)
  const mac = token.slice(i + 1)
  const expected = sign(userId)
  if (mac.length !== expected.length) return null
  try {
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null
  } catch {
    return null
  }
  return userId
}

/** Отправка сообщения; true = доставлено. Никогда не бросает. */
export async function sendTelegramSafe(
  chatId: string,
  html: string,
  url?: string,
): Promise<boolean> {
  if (!TOKEN) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        ...(url
          ? {
              reply_markup: {
                inline_keyboard: [[{ text: 'Открыть на Ателье', url: `${SITE_URL}${url}` }]],
              },
            }
          : {}),
      }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      console.error('[telegram] sendMessage', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (e) {
    console.error('[telegram] sendMessage', e)
    return false
  }
}
