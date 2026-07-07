import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Flag, ShieldCheck } from 'lucide-react'
import { canModerate } from '@atelier/core'
import { CaseModerationActions, ReportActions } from '@/components/admin-actions'
import { EmptyState } from '@/components/empty-state'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Badge } from '@/components/ui/badge'
import { getSessionUser } from '@/server/auth'
import { getModerationQueue } from '@/server/data'
import { timeAgo } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Модерация' }

export default async function AdminPage() {
  const user = await getSessionUser()
  // существование админки не раскрываем — для посторонних её «нет»
  if (!user || !canModerate(user.role)) notFound()

  const { pendingCases, openReports } = await getModerationQueue()

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pt-10">
          <h1 className="font-display text-[32px] leading-[1.12] font-semibold tracking-tight sm:text-4xl">
            Модерация
          </h1>
          <Link
            href="/admin/stats"
            className="text-sm font-medium text-muted-foreground underline decoration-border-strong underline-offset-4 transition-colors hover:text-foreground hover:decoration-current"
          >
            Статистика →
          </Link>
        </div>
        <p className="mt-2 mb-8 text-sm leading-relaxed text-muted-foreground">
          Премодерация первых кейсов новичков и жалобы. Скрытие контента даёт автору страйк —
          три страйка замораживают аккаунт.
        </p>

        <section aria-labelledby="premod">
          <h2 id="premod" className="mb-4 font-display text-xl font-semibold">
            Премодерация{pendingCases.length > 0 ? ` (${pendingCases.length})` : ''}
          </h2>
          {pendingCases.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Очередь пуста"
              description="Новые кейсы новичков появятся здесь — обычно проверка занимает пару минут на кейс."
            />
          ) : (
            <ul className="space-y-4">
              {pendingCases.map((c) => (
                <li key={c.id} className="rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
                  <div className="flex gap-4">
                    <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-surface-muted">
                      {c.image.src ? (
                        <Image
                          src={c.image.src}
                          alt={c.title}
                          fill
                          sizes="112px"
                          className="object-cover"
                          {...(c.image.blurDataURL
                            ? { placeholder: 'blur' as const, blurDataURL: c.image.blurDataURL }
                            : {})}
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        {/* модератор обязан открыть кейс перед решением — ссылка видима и на таче */}
                        <Link
                          href={`/case/${c.slug}`}
                          className="line-clamp-2 min-w-0 font-semibold underline decoration-border-strong underline-offset-4 hover:decoration-current"
                        >
                          {c.title}
                        </Link>
                        <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">
                          {timeAgo(c.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        {c.authorName}
                        <Badge variant="neutral" size="sm" className="ml-2 align-middle">
                          новичок
                        </Badge>
                      </p>
                      <p className="mt-0.5 text-[13px] text-muted-foreground">
                        {[c.isDeal ? 'Кейс-сделка' : 'Проект', c.districtName]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3.5 border-t border-border pt-3.5">
                    <CaseModerationActions caseId={c.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="reports" className="mt-10">
          <h2 id="reports" className="mb-4 font-display text-xl font-semibold">
            Жалобы{openReports.length > 0 ? ` (${openReports.length})` : ''}
          </h2>
          {openReports.length === 0 ? (
            <EmptyState
              icon={Flag}
              title="Открытых жалоб нет"
              description="Жалобы пользователей и гостей на кейсы и отзывы будут собираться здесь."
            />
          ) : (
            <ul className="space-y-4">
              {openReports.map((r) => (
                <li key={r.id} className="rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <Badge variant="danger" size="sm">
                      {r.reasonLabel}
                    </Badge>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {timeAgo(r.createdAt)}
                    </span>
                  </div>
                  {r.target ? (
                    <p className="mt-2.5 text-sm">
                      {r.target.href ? (
                        <Link
                          href={r.target.href}
                          className="font-medium underline decoration-border-strong underline-offset-4 hover:decoration-current"
                        >
                          {r.target.title}
                        </Link>
                      ) : (
                        <span className="font-medium">{r.target.title}</span>
                      )}
                    </p>
                  ) : null}
                  {r.comment ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      «{r.comment}» — {r.reporterName}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-[13px] text-muted-foreground">От: {r.reporterName}</p>
                  )}
                  <div className="mt-3.5 border-t border-border pt-3.5">
                    <ReportActions reportId={r.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
