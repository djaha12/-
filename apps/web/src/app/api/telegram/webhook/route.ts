import { timingSafeEqual, createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@atelier/db'
import { sendTelegramSafe, verifyLinkToken } from '@/server/telegram'

export const dynamic = 'force-dynamic'

const sha = (s: string) => createHash('sha256').update(s).digest()

/**
 * Вебхук Telegram-бота. Fail-closed: без TELEGRAM_WEBHOOK_SECRET — 401 всегда;
 * Telegram шлёт секрет в X-Telegram-Bot-Api-Secret-Token (задаётся в setWebhook).
 * Команды: /start <токен> — привязка аккаунта, /stop — отвязка.
 */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  const header = req.headers.get('x-telegram-bot-api-secret-token') ?? ''
  if (!secret || !timingSafeEqual(sha(header), sha(secret))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const update = (await req.json().catch(() => null)) as {
    message?: { text?: string; chat?: { id?: number | string } }
  } | null
  const text = update?.message?.text?.trim()
  const chatId = update?.message?.chat?.id != null ? String(update.message.chat.id) : null
  // не наш формат апдейта — подтверждаем, чтобы Telegram не ретраил
  if (!text || !chatId) return NextResponse.json({ ok: true })

  if (text.startsWith('/start')) {
    const token = text.split(/\s+/)[1]
    const userId = token ? verifyLinkToken(token) : null
    if (!userId) {
      await sendTelegramSafe(
        chatId,
        'Чтобы привязать уведомления, откройте «Настройки → Уведомления» на Ателье и перейдите по кнопке оттуда.',
      )
      return NextResponse.json({ ok: true })
    }
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || user.deletedAt) return NextResponse.json({ ok: true })
    // chatId уникален: перепривязка с другого аккаунта освобождает его
    await prisma.$transaction([
      prisma.user.updateMany({
        where: { telegramChatId: chatId, id: { not: userId } },
        data: { telegramChatId: null },
      }),
      prisma.user.update({ where: { id: userId }, data: { telegramChatId: chatId } }),
    ])
    await sendTelegramSafe(
      chatId,
      '<b>Готово!</b> Уведомления Ателье будут приходить сюда: заявки, брифы, статусы заказов и отзывы.\n\nОтключить: /stop',
    )
    return NextResponse.json({ ok: true })
  }

  if (text.startsWith('/stop')) {
    await prisma.user.updateMany({ where: { telegramChatId: chatId }, data: { telegramChatId: null } })
    await sendTelegramSafe(chatId, 'Уведомления отключены. Привязать снова можно в настройках Ателье.')
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true })
}
