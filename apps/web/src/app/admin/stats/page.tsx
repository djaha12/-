import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { canModerate } from '@atelier/core'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { getSessionUser } from '@/server/auth'
import { getOwnerStats } from '@/server/stats'
import { plural } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Статистика' }

function Tile({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <p className="font-display text-[34px] leading-none font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{label}</p>
      {sub ? <p className="mt-0.5 text-[13px] text-faint-foreground">{sub}</p> : null}
    </div>
  )
}

/** Одна серия — один цвет (терракота), подписи текстовыми токенами, без легенды.
 *  На 390 метка встаёт над баром — треку остаётся вся ширина. */
function FunnelRow({
  label,
  value,
  max,
  prev,
}: {
  label: string
  value: number
  max: number
  prev?: number
}) {
  const width = max > 0 ? Math.min(Math.max((value / max) * 100, value > 0 ? 4 : 0), 100) : 0
  const conversion = prev != null && prev > 0 ? Math.round((value / prev) * 100) : null
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-sm text-muted-foreground sm:w-40 sm:shrink-0">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span className="relative h-7 min-w-0 flex-1 overflow-hidden rounded-md bg-surface-muted">
          <span
            className="absolute inset-y-0 left-0 rounded-md bg-accent"
            style={{ width: `${width}%` }}
            title={`${label}: ${value}`}
          />
        </span>
        <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
          {value}
          {conversion != null ? (
            <span className="ml-1.5 font-normal text-muted-foreground">{conversion}%</span>
          ) : null}
        </span>
      </span>
    </div>
  )
}

export default async function StatsPage() {
  const user = await getSessionUser()
  if (!user || !canModerate(user.role)) notFound()
  const s = await getOwnerStats()
  // max по всем шагам: живые данные не обязаны сужаться (заказы бывают из старых диалогов)
  const funnelMax = Math.max(
    s.funnel30d.leads,
    s.funnel30d.orders,
    s.funnel30d.completed,
    s.funnel30d.reviews,
    1,
  )
  const districtMax = Math.max(...s.topDistricts.map((d) => d.confirmed), 1)

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <div className="pt-8">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Модерация
          </Link>
        </div>
        <h1 className="mt-4 font-display text-[32px] leading-[1.12] font-semibold tracking-tight sm:text-4xl">
          Статистика
        </h1>
        <p className="mt-2 mb-8 text-sm leading-relaxed text-muted-foreground">
          Живые цифры платформы: люди, воронка доверия за 30 дней, контент. Активность — по
          событиям платформы (вход, заявки, заказы, отзывы).
        </p>

        <section aria-label="Люди" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Tile value={s.users.total} label="Пользователей" sub={`+${s.users.new30d} за 30 дней`} />
          <Tile value={s.users.specialists} label="Специалистов" />
          <Tile value={s.activity.actors7d} label="Активных за 7 дней" />
          <Tile
            value={s.activity.actors30d}
            label="Активных за 30 дней"
            sub={`${s.activity.events30d} ${plural(s.activity.events30d, 'событие', 'события', 'событий')}`}
          />
        </section>

        <section aria-labelledby="funnel" className="mt-10">
          <h2 id="funnel" className="mb-1 font-display text-xl font-semibold">
            Воронка доверия · 30 дней
          </h2>
          <p className="mb-4 text-[13px] text-muted-foreground">
            Заявка → заказ → завершён → отзыв. Процент — конверсия из предыдущего шага.
          </p>
          <div className="space-y-2.5 rounded-2xl border border-border bg-surface p-5 shadow-card">
            <FunnelRow label="Диалоги (заявки)" value={s.funnel30d.leads} max={funnelMax} />
            <FunnelRow label="Заказы" value={s.funnel30d.orders} max={funnelMax} prev={s.funnel30d.leads} />
            <FunnelRow label="Завершено" value={s.funnel30d.completed} max={funnelMax} prev={s.funnel30d.orders} />
            <FunnelRow label="Отзывы" value={s.funnel30d.reviews} max={funnelMax} prev={s.funnel30d.completed} />
          </div>
        </section>

        <section aria-labelledby="briefs" className="mt-8">
          <h2 id="briefs" className="mb-4 font-display text-xl font-semibold">
            Брифы · 30 дней
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <Tile value={s.briefs30d.created} label="Создано" />
            <Tile value={s.briefs30d.responses} label="Откликов" />
            <Tile value={s.briefs30d.accepted} label="Чатов открыто" />
          </div>
        </section>

        <section aria-labelledby="content" className="mt-8">
          <h2 id="content" className="mb-4 font-display text-xl font-semibold">
            Контент
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Tile value={s.content.published} label="Кейсов в ленте" />
            <Tile value={s.content.deals} label="Кейсов-сделок" />
            <Tile value={s.content.confirmed} label="Подтверждено клиентами" />
            <Tile
              value={s.content.pendingQueue + s.content.openReports}
              label="Ждёт модерации"
              sub={`${s.content.pendingQueue} премод · ${s.content.openReports} жалоб`}
            />
          </div>
        </section>

        {s.topDistricts.length > 0 ? (
          <section aria-labelledby="districts" className="mt-8">
            <h2 id="districts" className="mb-4 font-display text-xl font-semibold">
              Подтверждённые сделки по районам
            </h2>
            <div className="space-y-2.5 rounded-2xl border border-border bg-surface p-5 shadow-card">
              {s.topDistricts.map((d) => (
                <FunnelRow key={d.name} label={d.name} value={d.confirmed} max={districtMax} />
              ))}
            </div>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </>
  )
}
