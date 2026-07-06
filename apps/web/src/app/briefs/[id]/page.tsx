import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, BadgeCheck, Inbox } from 'lucide-react'
import { BriefRespondForm, CloseBriefButton, OpenChatButton } from '@/components/brief-actions'
import { EmptyState } from '@/components/empty-state'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { getSessionUser } from '@/server/auth'
import { getBriefView, type BriefResponseItem } from '@/server/data'
import { formatBudgetRange, formatSom, plural, timeAgo } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Бриф' }

const RESPONSE_STATUS: Record<string, { label: string; variant: 'neutral' | 'success' }> = {
  SENT: { label: 'Отправлен', variant: 'neutral' },
  VIEWED: { label: 'Просмотрен клиентом', variant: 'neutral' },
  SHORTLISTED: { label: 'В коротком списке', variant: 'success' },
  ACCEPTED: { label: 'Клиент открыл чат', variant: 'success' },
  DECLINED: { label: 'Отклонён', variant: 'neutral' },
}

function CaseThumbs({ cases }: { cases: BriefResponseItem['cases'] }) {
  if (cases.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2.5">
      {cases.map((c) => (
        <Link
          key={c.slug}
          href={`/case/${c.slug}`}
          title={c.title}
          className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-surface-muted transition-opacity hover:opacity-90"
        >
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
          ) : (
            <span className="flex h-full items-center justify-center px-2 text-center text-[11px] leading-tight text-muted-foreground">
              {c.title}
            </span>
          )}
        </Link>
      ))}
    </div>
  )
}

function ResponseCard({ r, owner }: { r: BriefResponseItem; owner: boolean }) {
  const status = RESPONSE_STATUS[r.status]
  return (
    <li className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center gap-3">
        <Avatar name={r.specialist.name} className="size-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-semibold">
            {r.specialist.slug ? (
              <Link href={`/s/${r.specialist.slug}`} className="truncate hover:underline">
                {r.specialist.name}
              </Link>
            ) : (
              <span className="truncate">{r.specialist.name}</span>
            )}
            {r.specialist.verified ? (
              <BadgeCheck className="size-4 shrink-0 text-accent" aria-label="Личность подтверждена" />
            ) : null}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {r.specialist.profession}
            {r.specialist.reviewsCount > 0
              ? ` · ★ ${r.specialist.rating.toFixed(1)} · ${r.specialist.reviewsCount} ${plural(r.specialist.reviewsCount, 'отзыв', 'отзыва', 'отзывов')}`
              : ' · отзывов пока нет'}
          </p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>
      </div>

      <p className="mt-3.5 text-sm leading-relaxed whitespace-pre-line">{r.message}</p>
      {r.priceEstimate ? (
        <p className="mt-2.5 text-sm">
          Предварительная оценка:{' '}
          <span className="font-semibold">~{formatSom(r.priceEstimate)}</span>
        </p>
      ) : null}
      <CaseThumbs cases={r.cases} />

      {owner ? (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
          <OpenChatButton responseId={r.id} accepted={r.status === 'ACCEPTED'} />
          {status && r.status === 'ACCEPTED' ? (
            <Badge variant="success" size="sm">
              {status.label}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const view = await getBriefView(id, user.id)
  if (!view) notFound()

  const { brief } = view
  const isOwner = view.role === 'owner'
  const meta = [
    brief.objectTypeLabel,
    brief.districtName,
    brief.budgetMin && brief.budgetMax
      ? formatBudgetRange(brief.budgetMin, brief.budgetMax).som
      : null,
    !isOwner ? `клиент: ${view.brief.clientName}` : null,
    timeAgo(brief.createdAt),
  ].filter(Boolean)

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 pb-20 sm:px-6">
        <div className="pt-8">
          <Link
            href="/briefs"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {isOwner ? 'Мои брифы' : 'Все брифы'}
          </Link>
        </div>

        {/* на 390 «Закрыть бриф» уходит под заголовок, не сжимая его */}
        <div className="mt-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5">
          <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
            <h1 className="font-display text-[28px] leading-[1.15] font-semibold tracking-tight sm:text-[32px]">
              {brief.title}
            </h1>
            <p className="mt-2 text-[13px] text-muted-foreground">{meta.join(' · ')}</p>
          </div>
          {brief.status !== 'OPEN' ? (
            <Badge variant="neutral" size="md" className="shrink-0 sm:mt-1">
              Закрыт
            </Badge>
          ) : isOwner ? (
            <div className="shrink-0 sm:mt-1">
              <CloseBriefButton briefId={brief.id} />
            </div>
          ) : null}
        </div>

        {brief.description ? (
          <p className="mt-4 text-[15px] leading-relaxed whitespace-pre-line">{brief.description}</p>
        ) : null}

        {isOwner ? (
          <section className="mt-9">
            <h2 className="mb-4 font-display text-xl font-semibold">
              {view.responses.length > 0
                ? `Отклики (${view.responses.length})`
                : 'Отклики'}
            </h2>
            {view.responses.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Пока никто не откликнулся"
                description="Обычно первые отклики приходят в течение дня. Мы покажем их здесь — загляните позже."
              />
            ) : (
              <ul className="space-y-4">
                {view.responses.map((r) => (
                  <ResponseCard key={r.id} r={r} owner />
                ))}
              </ul>
            )}
          </section>
        ) : view.myResponse ? (
          <section className="mt-9">
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-lg font-semibold">Ваш отклик</p>
                {RESPONSE_STATUS[view.myResponse.status] ? (
                  <Badge variant={RESPONSE_STATUS[view.myResponse.status]!.variant} size="sm">
                    {RESPONSE_STATUS[view.myResponse.status]!.label}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">
                {view.myResponse.message}
              </p>
              {view.myResponse.priceEstimate ? (
                <p className="mt-2.5 text-sm">
                  Ваша оценка:{' '}
                  <span className="font-semibold">~{formatSom(view.myResponse.priceEstimate)}</span>
                </p>
              ) : null}
              <CaseThumbs cases={view.myResponse.cases} />
              <p className="mt-4 border-t border-border pt-3.5 text-[13px] text-muted-foreground">
                Если отклик заинтересует клиента, он откроет чат — диалог появится в «Сообщениях».
              </p>
            </div>
          </section>
        ) : brief.status === 'OPEN' ? (
          <section className="mt-9">
            <BriefRespondForm briefId={brief.id} myCases={view.myCases} quota={view.quota} />
          </section>
        ) : (
          <p className="mt-9 rounded-xl border border-dashed border-border-strong px-5 py-6 text-center text-sm text-muted-foreground">
            Бриф закрыт — клиент нашёл исполнителя или снял задачу.
          </p>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
