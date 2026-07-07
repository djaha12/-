import Image from 'next/image'
import Link from 'next/link'
import { ChevronRight, MapPin } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { RatingStars } from '@/components/rating-stars'
import { VerifiedBadge } from '@/components/verified-badge'
import type { MockImage, Specialist } from '@/mock/data'
import { cn, plural } from '@/lib/utils'

function Fact({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>
}

/** одна строка, которая продаёт доверие — цифры на тон сильнее меты (паттерн Airbnb) */
function TrustLine({ s }: { s: Specialist }) {
  if (s.dealStats) {
    const d = s.dealStats
    return (
      <>
        <Fact>
          {d.closed} {plural(d.closed, 'сделка', 'сделки', 'сделок')}
        </Fact>{' '}
        · <Fact>{d.confirmed}</Fact> {plural(d.confirmed, 'подтверждена', 'подтверждены', 'подтверждено')} клиентами · продажа{' '}
        <Fact>
          ~{d.medianDaysOnMarket} {plural(d.medianDaysOnMarket, 'день', 'дня', 'дней')}
        </Fact>
      </>
    )
  }
  return (
    <>
      <Fact>
        {s.projectsCount} {plural(s.projectsCount, 'проект', 'проекта', 'проектов')}
      </Fact>{' '}
      · <Fact>{s.repeatClientsPct}%</Fact> повторных клиентов · отвечает <Fact>{s.responseTime}</Fact>
    </>
  )
}

export interface SpecialistThumb {
  id: string
  title: string
  image: MockImage
}

export function SpecialistCard({
  specialist: s,
  thumbs,
}: {
  specialist: Specialist
  thumbs: SpecialistThumb[]
}) {
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
            {s.profession}
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
          <span className="text-sm font-bold">{s.rating.toFixed(1).replace('.', ',')}</span>
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
          Портфолио заполняется
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="truncate text-[13px] text-muted-foreground">
          <TrustLine s={s} />
        </p>
        <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-accent">
          Профиль
          <ChevronRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  )
}
