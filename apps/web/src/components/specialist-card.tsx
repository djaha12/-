import Image from 'next/image'
import Link from 'next/link'
import { ChevronRight, MapPin } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { RatingStars } from '@/components/rating-stars'
import { VerifiedBadge } from '@/components/verified-badge'
import type { MockImage, Specialist } from '@/mock/data'
import { fmt, pluralize, type Dict, type Locale } from '@/i18n/dictionaries'
import { getDict } from '@/i18n/server'
import { cn, formatRating } from '@/lib/utils'

function Fact({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>
}

/** одна строка, которая продаёт доверие — цифры на тон сильнее меты (паттерн Airbnb) */
function TrustLine({ s, t, locale }: { s: Specialist; t: Dict; locale: Locale }) {
  if (s.dealStats) {
    const d = s.dealStats
    return (
      <>
        <Fact>
          {d.closed} {pluralize(locale, d.closed, t.card.deals)}
        </Fact>{' '}
        · <Fact>{d.confirmed}</Fact> {pluralize(locale, d.confirmed, t.card.confirmedByClients)} ·{' '}
        {t.card.sale}{' '}
        <Fact>
          ~{d.medianDaysOnMarket} {pluralize(locale, d.medianDaysOnMarket, t.card.days)}
        </Fact>
      </>
    )
  }
  // минуты ответа локализуемы через responseMinutes; мок-данные без него — ru-фолбэк
  const responds =
    s.responseMinutes != null
      ? s.responseMinutes < 60
        ? fmt(t.card.respondsMinutes, { n: s.responseMinutes })
        : fmt(t.card.respondsHours, { n: Math.round(s.responseMinutes / 60) })
      : s.responseTime
  return (
    <>
      <Fact>
        {s.projectsCount} {pluralize(locale, s.projectsCount, t.card.projects)}
      </Fact>{' '}
      · <Fact>{s.repeatClientsPct}%</Fact> {t.card.repeatClients} · {t.card.responds}{' '}
      <Fact>{responds}</Fact>
    </>
  )
}

export interface SpecialistThumb {
  id: string
  title: string
  image: MockImage
}

export async function SpecialistCard({
  specialist: s,
  thumbs,
}: {
  specialist: Specialist
  thumbs: SpecialistThumb[]
}) {
  const { locale, t } = await getDict()
  const profession =
    (s.specializationCode &&
      (t.specializations as Record<string, string>)[s.specializationCode]) ||
    s.profession
  return (
    <Link
      href={`/s/${s.slug}`}
      className="group block rounded-xl border border-border bg-surface p-5 transition-[border-color,box-shadow] duration-200 ease-(--ease-soft) hover:border-border-strong hover:shadow-card"
    >
      <div className="flex items-start gap-3">
        <Avatar name={s.name} className="size-13 text-lg" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[17px] font-semibold">
            <span className="truncate">{s.name}</span>
            {s.verified ? <VerifiedBadge /> : null}
            {s.pro ? (
              <span className="rounded-full border border-border-strong px-1.5 py-px text-[10px] font-semibold tracking-wide text-muted-foreground">
                PRO
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {profession}
            {s.worksAt ? ` · ${s.worksAt}` : ''}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {s.city}
              {s.dealStats?.districts.length ? ` · ${s.dealStats.districts.join(', ')}` : ''}
            </span>
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
          <RatingStars value={s.rating} size={13} />
          <span className="text-sm font-bold">{formatRating(locale, s.rating)}</span>
          <span className="text-[13px] text-muted-foreground">({s.reviewsCount})</span>
        </span>
      </div>

      {thumbs.length > 0 ? (
        <div
          className={cn(
            'mt-4 grid gap-2',
            thumbs.length === 1 && 'grid-cols-1',
            thumbs.length === 2 && 'grid-cols-2',
            thumbs.length >= 3 && 'grid-cols-3',
          )}
        >
          {thumbs.map((c) => (
            <span key={c.id} className="relative block h-24 overflow-hidden rounded-lg bg-surface-muted sm:h-28">
              <Image
                src={c.image.src}
                alt={c.title}
                fill
                placeholder="blur"
                blurDataURL={c.image.blurDataURL}
                sizes={
                  thumbs.length === 1
                    ? '(max-width: 1023px) 94vw, 520px'
                    : thumbs.length === 2
                      ? '(max-width: 640px) 45vw, 250px'
                      : '(max-width: 640px) 30vw, 170px'
                }
                className="object-cover transition-transform duration-300 ease-(--ease-soft) group-hover:scale-[1.03]"
              />
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex h-24 items-center justify-center rounded-lg border border-dashed border-border-strong text-[13px] text-faint-foreground sm:h-28">
          {t.card.portfolioFilling}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="truncate text-[13px] text-muted-foreground">
          <TrustLine s={s} t={t} locale={locale} />
        </p>
        <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-accent">
          {t.card.profileCta}
          <ChevronRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  )
}
