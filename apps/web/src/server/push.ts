import 'server-only'
import webpush from 'web-push'
import { prisma } from '@atelier/db'
import { SITE_URL } from '@/lib/site'

/**
 * Web Push канал (M11). Как и Telegram: без VAPID-ключей всё деградирует тихо —
 * in-app центр работает, push пропускается, тумблер в настройках скрыт.
 * Ключи генерируются один раз: npx web-push generate-vapid-keys.
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? null
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? null
const SUBJECT = process.env.VAPID_SUBJECT ?? `mailto:support@atelier.kg`

let configured = false
function ensureConfigured(): boolean {
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false
  if (!configured) {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY)
    configured = true
  }
  return true
}

export function pushEnabled(): boolean {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY)
}

/** Публичный VAPID-ключ для PushManager.subscribe; null = канал не настроен */
export function getVapidPublicKey(): string | null {
  return pushEnabled() ? PUBLIC_KEY : null
}

export interface PushPayload {
  title: string
  body?: string
  /** относительный url перехода по клику */
  url?: string
}

/** Кап устройств на пользователя: и здесь (чтение), и в subscribePush (запись) —
 *  без капа один аккаунт тысячей подписок съедал бы бюджет крона (cross-user DoS) */
export const MAX_PUSH_SUBSCRIPTIONS = 10

/**
 * Отправить push в подписки пользователя; true = доставлено хотя бы в одну.
 * Отправки параллельны (wall-time ~5с независимо от числа устройств).
 * Протухшие подписки (404/410 от push-сервиса) удаляются. Никогда не бросает.
 */
export async function sendPushToUserSafe(userId: string, payload: PushPayload): Promise<boolean> {
  if (!ensureConfigured()) return false
  try {
    const subs = await prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: MAX_PUSH_SUBSCRIPTIONS,
    })
    if (subs.length === 0) return false
    const body = JSON.stringify({
      title: payload.title,
      body: payload.body ?? '',
      url: payload.url ? `${SITE_URL}${payload.url}` : SITE_URL,
    })
    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 24 * 3600, timeout: 5000 },
        ),
      ),
    )
    let delivered = false
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!
      if (r.status === 'fulfilled') {
        delivered = true
        continue
      }
      const status = (r.reason as { statusCode?: number }).statusCode
      // подписка отозвана браузером/пользователем — чистим, это не ошибка
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: subs[i]!.id } }).catch(() => {})
      } else {
        console.error('[push] send', status ?? r.reason)
      }
    }
    return delivered
  } catch (e) {
    console.error('[push] sendPushToUserSafe', e)
    return false
  }
}
