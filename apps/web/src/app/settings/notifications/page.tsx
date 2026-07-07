import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BadgeCheck, Bell, FileText, MessageSquareText, Star } from 'lucide-react'
import { prisma } from '@atelier/db'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Badge } from '@/components/ui/badge'
import { TelegramLinkButton, TelegramUnlinkButton } from '@/components/telegram-link'
import { getSessionUser } from '@/server/auth'
import { makeLinkToken, TELEGRAM_BOT_USERNAME } from '@/server/telegram'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Уведомления — настройки' }

const MATRIX = [
  { icon: MessageSquareText, label: 'Новые заявки и открытые по брифам чаты' },
  { icon: FileText, label: 'Отклики на ваши брифы' },
  { icon: Bell, label: 'Статусы заказов: условия, сдача, завершение' },
  { icon: Star, label: 'Новые отзывы' },
  { icon: BadgeCheck, label: 'Решения модерации по вашим кейсам' },
]

export default async function NotificationSettingsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { telegramChatId: true },
  })
  const linked = Boolean(row?.telegramChatId)
  // токен null, если не задан секрет привязки (fail-closed) — тогда кнопку не показываем
  const linkToken = makeLinkToken(user.id)
  const deepLink =
    TELEGRAM_BOT_USERNAME && linkToken
      ? `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${linkToken}`
      : null

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 pb-20 sm:px-6">
        <h1 className="pt-10 font-display text-[32px] leading-[1.12] font-semibold tracking-tight sm:text-4xl">
          Настройки уведомлений
        </h1>
        <p className="mt-2 mb-8 text-sm leading-relaxed text-muted-foreground">
          Центр уведомлений работает всегда. Подключите Telegram — всё важное будет
          приходить мгновенно, прямо в чат с ботом.
        </p>

        <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-lg font-semibold">Telegram</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {linked
                  ? 'Привязан — уведомления приходят в чат с ботом.'
                  : 'Не привязан. Уведомления видны только в центре на сайте.'}
              </p>
            </div>
            {linked ? (
              <Badge variant="success" size="md">
                Подключено
              </Badge>
            ) : null}
          </div>
          <div className="mt-4 border-t border-border pt-4">
            {linked ? (
              <TelegramUnlinkButton />
            ) : deepLink ? (
              <>
                <TelegramLinkButton deepLink={deepLink} />
                <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
                  Откроется чат с ботом — нажмите «Start», и привязка завершится сама.
                </p>
              </>
            ) : (
              <p className="rounded-xl bg-surface-muted px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                Бот появится с запуском платформы — привязка станет доступна здесь.
                Пока все уведомления собираются в центре на сайте.
              </p>
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 font-display text-xl font-semibold">О чём присылаем</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {MATRIX.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 px-4 py-3.5 text-sm sm:px-5">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
            Сообщения из чатов сюда не дублируем — они ждут вас в «Сообщениях».
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
