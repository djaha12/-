import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bell, Settings } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Button } from '@/components/ui/button'
import { getSessionUser } from '@/server/auth'
import { getNotifications, type NotificationItem } from '@/server/data'
import { cn, timeAgo } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Уведомления' }

function Row({ n }: { n: NotificationItem }) {
  const inner = (
    <>
      <span
        className={cn(
          'mt-2 size-2 shrink-0 rounded-full',
          n.wasUnread ? 'bg-accent' : 'bg-transparent',
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className={cn('truncate text-sm', n.wasUnread ? 'font-semibold' : 'font-medium')}>
            {n.title}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
        </span>
        {n.body ? (
          <span className="mt-0.5 line-clamp-2 block text-sm leading-relaxed text-muted-foreground">
            {n.body}
          </span>
        ) : null}
      </span>
    </>
  )
  const cls = 'flex gap-3 px-4 py-3.5 sm:px-5'
  return (
    <li>
      {n.url ? (
        <Link href={n.url} className={cn(cls, 'transition-colors hover:bg-surface-muted/60')}>
          {inner}
        </Link>
      ) : (
        <div className={cls}>{inner}</div>
      )}
    </li>
  )
}

export default async function NotificationsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const items = await getNotifications(user.id)

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 pb-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pt-10 pb-6">
          <h1 className="font-display text-[32px] leading-[1.12] font-semibold tracking-tight sm:text-4xl">
            Уведомления
          </h1>
          <Button asChild variant="ghost" size="sm" className="h-11 text-muted-foreground sm:h-9">
            <Link href="/settings/notifications">
              <Settings aria-hidden />
              Настроить
            </Link>
          </Button>
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Пока тихо"
            description="Здесь появятся заявки, отклики на брифы, статусы заказов и отзывы. Подключите Telegram в настройках — будет приходить мгновенно."
            actionLabel="Настроить уведомления"
            actionHref="/settings/notifications"
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {items.map((n) => (
              <Row key={n.id} n={n} />
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
