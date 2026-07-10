import type { Metadata } from 'next'
import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { SpecialistCard } from '@/components/specialist-card'
import { getDict } from '@/i18n/server'
import { fmt, type Dict } from '@/i18n/dictionaries'
import { getDistricts, getSpecialists } from '@/server/data'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Специалисты',
  description:
    'Риелторы, дизайнеры интерьера, архитекторы и команды Кыргызстана — с проверяемой историей работ и отзывами по завершённым заказам.',
}

// риелторы — приоритетная вертикаль: сразу после «Все»
function filters(t: Dict): Array<{ label: string; value?: string }> {
  return [
    { label: t.catalog.all },
    { label: t.catalog.realtors, value: 'REALTOR' },
    { label: t.catalog.interior, value: 'INTERIOR_DESIGNER' },
    { label: t.catalog.architecture, value: 'ARCHITECT' },
    { label: t.catalog.landscape, value: 'LANDSCAPE_DESIGNER' },
    { label: t.catalog.staging, value: 'DECORATOR_STAGER' },
    { label: t.catalog.viz3d, value: 'VISUALIZER_3D' },
    { label: t.catalog.photo, value: 'PHOTO_VIDEO' },
  ]
}

function chipHref(params: { spec?: string; district?: string; q?: string }) {
  const p = new URLSearchParams()
  if (params.spec) p.set('spec', params.spec)
  if (params.district) p.set('district', params.district)
  if (params.q) p.set('q', params.q)
  const s = p.toString()
  return s ? `/specialists?${s}` : '/specialists'
}

export default async function SpecialistsPage({
  searchParams,
}: {
  searchParams: Promise<{ spec?: string; district?: string; q?: string }>
}) {
  const { spec, district, q } = await searchParams
  const [items, districts] = await Promise.all([
    getSpecialists({ specialization: spec, districtSlug: district, q }),
    getDistricts(),
  ])
  const { t } = await getDict()
  // район имеет смысл в первую очередь для риелторов
  const showDistricts = !spec || spec === 'REALTOR'

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1160px] px-4 pb-20 sm:px-6">
        <section className="pt-10 pb-6 sm:pt-14">
          <h1 className="font-display text-[32px] leading-[1.12] font-semibold tracking-tight sm:text-5xl">
            {t.catalog.title}
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            {q ? (
              <>
                {fmt(t.catalog.resultsFor, { q })} ·{' '}
                <Link href={chipHref({ spec, district })} className="font-medium text-foreground underline underline-offset-2">
                  {t.catalog.reset}
                </Link>
              </>
            ) : (
              t.catalog.subtitle
            )}
          </p>
        </section>

        <section
          aria-label={t.catalog.filters}
          className="sticky top-16 z-30 -mx-4 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6"
        >
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filters(t).map((f) => (
              <Link
                key={f.label}
                href={chipHref({ spec: f.value, district, q })}
                aria-current={(spec ?? undefined) === f.value ? 'page' : undefined}
                className={cn(
                  'inline-flex h-11 shrink-0 items-center gap-1 rounded-full border px-4 text-sm font-medium transition-colors duration-150',
                  (spec ?? undefined) === f.value
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
                )}
              >
                {f.label}
              </Link>
            ))}
          </div>
          {showDistricts ? (
            <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <span className="shrink-0 text-[13px] text-muted-foreground">{t.catalog.district}</span>
              {districts.slice(0, 6).map((d) => {
                const active = district === d.slug
                return (
                  <Link
                    key={d.slug}
                    href={chipHref({ spec, district: active ? undefined : d.slug, q })}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-150 max-sm:h-11',
                      active
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
                    )}
                  >
                    {d.name}
                  </Link>
                )
              })}
            </div>
          ) : null}
        </section>

        {items.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              icon={SearchX}
              title={t.catalog.emptyTitle}
              description={t.catalog.emptyDesc}
            />
          </div>
        ) : (
          <section aria-label={t.catalog.list} className="mt-6 grid gap-5 lg:grid-cols-2">
            {items.map(({ specialist, thumbs }) => (
              <SpecialistCard key={specialist.slug} specialist={specialist} thumbs={thumbs} />
            ))}
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
