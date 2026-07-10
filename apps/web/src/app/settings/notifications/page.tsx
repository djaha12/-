import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BadgeCheck, Bell, FileText, MessageSquareText, Star } from 'lucide-react'
import { prisma } from '@atelier/db'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Badge } from '@/components/ui/badge'
import { PushToggle } from '@/components/push-toggle'
import { TelegramLinkButton, TelegramUnlinkButton } from '@/components/telegram-link'
import { getDict } from '@/i18n/server'
import { getSessionUser } from '@/server/auth'
import { getVapidPublicKey } from '@/server/push'
import { makeLinkToken, TELEGRAM_BOT_USERNAME } from '@/server/telegram'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Уведомления — настройки' }

export default async function NotificationSettingsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const { t } = await getDict()
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
  // без VAPID-ключей push-секцию не показываем вовсе (как TG без бота)
  const vapidKey = getVapidPublicKey()

  const matrix = [
    { icon: MessageSquareText, label: t.settingsNotif.mLeads },
    { icon: FileText, label: t.settingsNotif.mResponses },
    { icon: Bell, label: t.settingsNotif.mOrders },
    { icon: Star, label: t.settingsNotif.mReviews },
    { icon: BadgeCheck, label: t.settingsNotif.mModeration },
  ]

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 pb-20 sm:px-6">
        <h1 className="pt-10 font-display text-[32px] leading-[1.12] font-semibold tracking-tight sm:text-4xl">
          {t.settingsNotif.title}
        </h1>
        <p className="mt-2 mb-8 text-sm leading-relaxed text-muted-foreground">
          {t.settingsNotif.subtitle}
        </p>

        <section className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-lg font-semibold">{t.settingsNotif.tgTitle}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {linked ? t.settingsNotif.tgLinked : t.settingsNotif.tgNotLinked}
              </p>
            </div>
            {linked ? (
              <Badge variant="success" size="md">
                {t.settingsNotif.connected}
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
                  {t.settingsNotif.tgHowTo}
                </p>
              </>
            ) : (
              <p className="rounded-xl bg-surface-muted px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                {t.settingsNotif.tgSoon}
              </p>
            )}
          </div>
        </section>

        {vapidKey ? (
          <section className="mt-5 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
            <div>
              <p className="font-display text-lg font-semibold">{t.push.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t.push.subOff}</p>
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <PushToggle vapidKey={vapidKey} />
            </div>
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="mb-3 font-display text-xl font-semibold">
            {t.settingsNotif.aboutTitle}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {matrix.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 px-4 py-3.5 text-sm sm:px-5">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[13px] leading-relaxed text-muted-foreground">
            {t.settingsNotif.noChatDup}
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
