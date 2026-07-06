import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/empty-state'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { getSessionUser } from '@/server/auth'
import { getThreads } from '@/server/data'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Сообщения' }

const ORDER_STATE_BADGE: Record<string, { label: string; variant: 'neutral' | 'accent' | 'success' }> = {
  DISCUSSION: { label: 'Заказ: условия', variant: 'accent' },
  AGREED: { label: 'Заказ: договорились', variant: 'accent' },
  IN_PROGRESS: { label: 'Заказ: в работе', variant: 'accent' },
  DELIVERED: { label: 'Заказ: сдан', variant: 'accent' },
  COMPLETED: { label: 'Заказ завершён', variant: 'success' },
  CANCELLED: { label: 'Заказ отменён', variant: 'neutral' },
  DISPUTED: { label: 'Заказ: спор', variant: 'neutral' },
}

function timeAgo(d: Date | null): string {
  if (!d) return ''
  const mins = Math.floor((Date.now() - d.getTime()) / 6e4)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч`
  return `${Math.floor(hours / 24)} дн`
}

export default async function MessagesPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const threads = await getThreads(user.id)

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 pb-20 sm:px-6">
        <h1 className="pt-10 pb-6 font-display text-[32px] leading-[1.12] font-semibold tracking-tight sm:text-4xl">
          Сообщения
        </h1>

        {threads.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="Пока нет диалогов"
            description="Найдите специалиста и отправьте заявку — переписка появится здесь. Специалисты отвечают в среднем за пару часов."
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {threads.map((t) => {
              // ролевой лейбл: «сдан» для клиента = требуется его действие
              const order =
                t.orderState === 'DELIVERED' && t.orderMine
                  ? { label: 'Ждёт вашего подтверждения', variant: 'accent' as const }
                  : t.orderState
                    ? ORDER_STATE_BADGE[t.orderState]
                    : null
              return (
                <li key={t.id}>
                  <Link
                    href={`/messages/${t.id}`}
                    className="flex items-center gap-3.5 px-4 py-4 transition-colors hover:bg-surface-muted/60"
                  >
                    <Avatar name={t.otherName} className="size-12 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-semibold">{t.otherName}</span>
                          {t.unread ? (
                            <span
                              className="size-2 shrink-0 rounded-full bg-accent"
                              aria-label="Непрочитанное"
                            />
                          ) : null}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {timeAgo(t.lastAt)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'mt-0.5 block truncate text-sm',
                          t.unread ? 'font-medium text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {t.lastMine ? 'Вы: ' : ''}
                        {t.lastText}
                      </span>
                      <span className="mt-1.5 flex items-center gap-2">
                        {t.otherProfession ? (
                          <span className="text-xs text-faint-foreground">{t.otherProfession}</span>
                        ) : null}
                        {order ? (
                          <Badge variant={order.variant} size="sm">
                            {order.label}
                          </Badge>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
