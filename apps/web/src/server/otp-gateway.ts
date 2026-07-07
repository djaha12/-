import 'server-only'

/**
 * Боевая доставка OTP через Telegram Gateway (gateway.telegram.org). Шлём НАШ код
 * (его хэш храним и проверяем сами в verifyOtp), синхронно и с таймаутом — если не
 * доставлено, requestOtp бросает ошибку и пользователь повторяет. Без токена
 * TELEGRAM_GATEWAY_TOKEN канал выключен, вызывающий деградирует на dev/песочницу.
 *
 * Ограничение: Gateway доставляет код В TELEGRAM по номеру телефона; для номеров
 * без Telegram нужен SMS-фолбэк (отдельный провайдер-агрегатор КР, Фаза 1.5).
 */

const GATEWAY_URL = 'https://gatewayapi.telegram.org/sendVerificationMessage'

export function otpGatewayEnabled(): boolean {
  return Boolean(process.env.TELEGRAM_GATEWAY_TOKEN)
}

export async function sendOtpViaGateway(
  phone: string,
  code: string,
  ttlSeconds: number,
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_GATEWAY_TOKEN
  if (!token) return { ok: false, error: 'gateway_disabled' }
  try {
    const res = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: phone, code, ttl: ttlSeconds }),
      signal: AbortSignal.timeout(5000),
    })
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
    if (res.ok && data?.ok) return { ok: true }
    return { ok: false, error: data?.error ?? `http_${res.status}` }
  } catch (e) {
    // таймаут/сеть — не роняем стеком, отдаём флаг для повтора
    return { ok: false, error: e instanceof Error ? e.name : 'network' }
  }
}
