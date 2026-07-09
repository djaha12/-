import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Clock, MapPin, Repeat2 } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CaseCard } from '@/components/case-card'
import { JsonLd } from '@/components/json-ld'
import { ReviewCard } from '@/components/review-card'
import { ShareButton } from '@/components/share-button'
import { RatingStars } from '@/components/rating-stars'
import { VerifiedBadge } from '@/components/verified-badge'
import { img } from '@/mock/data'
import { getSessionUser } from '@/server/auth'
import { getSpecialist, markSaved } from '@/server/data'
import { formatSom, plural } from '@/lib/utils'
import { SITE_URL } from '@/lib/site'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>
}): Promise<Metadata> {
  const { username } = await params
  const data = await getSpecialist(username)
  if (!data) return { title: 'Специалист не найден', robots: { index: false } }
  const s = data.specialist
  const description = [
    `${s.profession}, ${s.city}.`,
    s.reviewsCount > 0 ? `Рейтинг ${s.rating.toFixed(1)} по ${s.reviewsCount} отзывам.` : null,
    s.dealStats?.confirmed
      ? `${s.dealStats.confirmed} ${plural(s.dealStats.confirmed, 'сделка подтверждена', 'сделки подтверждены', 'сделок подтверждено')} клиентами.`
      : null,
    'Портфолио и честные отзывы на Ателье.',
  ]
    .filter(Boolean)
    .join(' ')
  return {
    title: `${s.name} — ${s.profession}, ${s.city}`,
    description,
    alternates: { canonical: `${SITE_URL}/s/${username}` },
    openGraph: {
      title: `${s.name} — ${s.profession}`,
      description,
      url: `${SITE_URL}/s/${username}`,
      images: [{ url: `/api/og/profile/${username}`, width: 1200, height: 630 }],
    },
  }
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { username } = await params
  const { tab } = await searchParams
  const data = await getSpecialist(username)
  if (!data) notFound()
  const viewer = await getSessionUser()
  const s = data.specialist
  const ownCases = await markSaved(data.cases, viewer?.id)
  const ownReviews = data.reviews

  const isRealtor = Boolean(s.dealStats)
  const cover = img(isRealtor ? 'cover2' : 'cover1')

  const avgOf = (pick: (r: (typeof ownReviews)[number]) => number) =>
    ownReviews.length
      ? ownReviews.reduce((sum, r) => sum + pick(r), 0) / ownReviews.length
      : s.rating
  const subscales = [
    { label: 'Качество', value: avgOf((r) => r.quality) },
    { label: 'Сроки', value: avgOf((r) => r.timing) },
    { label: 'Общение', value: avgOf((r) => r.communication) },
    { label: 'Бюджет', value: avgOf((r) => r.budget) },
  ]

  return (
    <>
      <SiteHeader />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          // риелторы — RealEstateAgent (realtor-first, docs/05 §7), остальные — Person
          '@type': isRealtor ? 'RealEstateAgent' : 'Person',
          name: s.name,
          jobTitle: s.profession,
          url: `${SITE_URL}/s/${s.slug}`,
          address: { '@type': 'PostalAddress', addressLocality: s.city, addressCountry: 'KG' },
          ...(s.worksAt ? { worksFor: { '@type': 'Organization', name: s.worksAt } } : {}),
          ...(s.reviewsCount > 0
            ? {
                aggregateRating: {
                  '@type': 'AggregateRating',
                  ratingValue: Number(s.rating.toFixed(1)),
                  reviewCount: s.reviewsCount,
                  bestRating: 5,
                },
                review: ownReviews.slice(0, 3).map((r) => ({
                  '@type': 'Review',
                  author: { '@type': 'Person', name: r.author },
                  reviewBody: r.text,
                  reviewRating: {
                    '@type': 'Rating',
                    ratingValue: Math.round((r.quality + r.timing + r.communication + r.budget) / 4),
                    bestRating: 5,
                  },
                })),
              }
            : {}),
        }}
      />
      <main className="mx-auto max-w-[1160px] px-4 pb-28 sm:px-6 sm:pb-24">
        <div className="relative mt-0 -mx-4 h-44 overflow-hidden sm:mx-0 sm:mt-5 sm:h-64 sm:rounded-2xl">
          <Image
            src={cover.src}
            alt=""
            fill
            priority
            placeholder="blur"
            blurDataURL={cover.blurDataURL}
            className="object-cover"
            sizes="(max-width: 1160px) 100vw, 1160px"
          />
        </div>

        <header className="relative">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <Avatar
                name={s.name}
                className="-mt-10 size-24 text-2xl ring-4 ring-background sm:-mt-12 sm:size-28"
              />
              <div className="pb-1">
                <h1 className="flex items-center gap-2 font-display text-[28px] font-semibold tracking-tight sm:text-4xl">
                  {s.name}
                  {s.verified ? <VerifiedBadge className="text-[20px] sm:text-[24px]" /> : null}
                  {s.pro ? (
                    <Badge variant="outline" size="sm" className="translate-y-0.5 font-sans tracking-wide">
                      PRO
                    </Badge>
                  ) : null}
                </h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-muted-foreground">
                  <span>
                    {s.profession}
                    {s.worksAt ? ` · ${s.worksAt}` : ''}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-4" aria-hidden />
                    {s.city}
                  </span>
                  {s.acceptsOrders ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-success">
                      <span className="size-2 rounded-full bg-success" aria-hidden />
                      Принимает заказы
                    </span>
                  ) : null}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pb-1">
              {viewer?.specialistSlug === s.slug ? (
                // владелец: заявку себе не шлют — вместо неё настройка профиля
                <Button asChild variant="secondary" size="lg">
                  <Link href="/onboarding">Настроить профиль</Link>
                </Button>
              ) : (
                // на мобильном primary живёт в нижнем баре — зона большого пальца
                <Button asChild size="lg" className="max-sm:hidden">
                  <a href={`/contact/${s.slug}`}>Отправить заявку</a>
                </Button>
              )}
              <ShareButton
                path={`/s/${s.slug}`}
                title={s.name}
                surface="profile"
                label="Поделиться профилем"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {s.styles.map((st) => (
              <Badge key={st} variant="neutral" size="md">
                {st}
              </Badge>
            ))}
            {s.dealStats
              ? s.dealStats.districts.map((d) => (
                  <Badge key={d} variant="outline" size="md">
                    <MapPin aria-hidden />
                    {d}
                  </Badge>
                ))
              : s.priceFrom > 0 && (
                  <Badge variant="outline" size="md">
                    от {formatSom(s.priceFrom)}/м²
                  </Badge>
                )}
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
            {[
              {
                dt: 'Рейтинг',
                dd: (
                  <span className="flex items-center gap-1.5">
                    <span className="font-display text-[22px] font-semibold">
                      {s.rating.toFixed(1).replace('.', ',')}
                    </span>
                    <RatingStars value={s.rating} size={13} />
                  </span>
                ),
                sub: `${s.reviewsCount} ${plural(s.reviewsCount, 'отзыв', 'отзыва', 'отзывов')}`,
              },
              // у риелтора доверие продают сделки и срок продажи, а не «проекты»
              ...(s.dealStats
                ? [
                    {
                      dt: 'Сделки',
                      dd: (
                        <span className="font-display text-[22px] font-semibold">
                          {s.dealStats.closed}
                        </span>
                      ),
                      sub: `${s.dealStats.confirmed} ${plural(s.dealStats.confirmed, 'подтверждена', 'подтверждены', 'подтверждено')} клиентами`,
                    },
                    {
                      dt: 'Срок продажи',
                      dd: (
                        <span className="font-display text-[22px] font-semibold">
                          {s.dealStats.medianDaysOnMarket}{' '}
                          {plural(s.dealStats.medianDaysOnMarket, 'день', 'дня', 'дней')}
                        </span>
                      ),
                      sub: 'типичный срок по подтверждённым сделкам',
                    },
                  ]
                : [
                    {
                      dt: 'Проекты',
                      dd: (
                        <span className="font-display text-[22px] font-semibold">
                          {s.projectsCount}
                        </span>
                      ),
                      sub: 'завершены через Ателье',
                    },
                    {
                      dt: 'Повторные клиенты',
                      dd: (
                        <span className="flex items-center gap-1.5 font-display text-[22px] font-semibold">
                          <Repeat2 className="size-4.5 text-success" aria-hidden />
                          {s.repeatClientsPct}%
                        </span>
                      ),
                      sub: 'возвращаются снова',
                    },
                  ]),
              {
                dt: 'Отвечает',
                dd: (
                  <span className="flex items-center gap-1.5 font-display text-[22px] font-semibold">
                    <Clock className="size-4.5 text-muted-foreground" aria-hidden />
                    {s.responseTime}
                  </span>
                ),
                sub: `на Ателье с ${s.memberSince} года`,
              },
            ].map((item) => (
              <div key={item.dt} className="bg-surface px-4 py-3.5">
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {item.dt}
                </dt>
                <dd className="mt-1">{item.dd}</dd>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.sub}</p>
              </div>
            ))}
          </dl>
        </header>

        <Tabs defaultValue={tab ?? 'cases'} className="mt-8">
          <TabsList>
            <TabsTrigger value="cases">
              {isRealtor ? 'Сделки' : 'Кейсы'}{' '}
              <span className="text-faint-foreground">{ownCases.length}</span>
            </TabsTrigger>
            <TabsTrigger value="reviews">
              Отзывы <span className="text-faint-foreground">{s.reviewsCount}</span>
            </TabsTrigger>
            <TabsTrigger value="about">О специалисте</TabsTrigger>
          </TabsList>

          <TabsContent value="cases">
            {isRealtor && s.dealStats ? (
              // кейсы vs «сделок всего» в статистике — снимаем противоречие явно
              <p className="mb-4 text-[13px] text-muted-foreground">
                {ownCases.length} {plural(ownCases.length, 'сделка', 'сделки', 'сделок')} оформлены
                как кейсы — из {s.dealStats.closed} завершённых
              </p>
            ) : null}
            {/* в витрине специалиста — ровные ряды (Behance), masonry только в ленте */}
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
              {ownCases.map((c) => (
                <CaseCard key={c.id} item={c} hideAuthor frame="fixed" />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="reviews">
            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
              <aside className="h-fit rounded-xl border border-border bg-surface p-5 lg:sticky lg:top-36">
                <p className="flex items-baseline gap-2">
                  <span className="font-display text-5xl font-semibold">
                    {s.rating.toFixed(1).replace('.', ',')}
                  </span>
                  <RatingStars value={s.rating} />
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {s.reviewsCount} {plural(s.reviewsCount, 'отзыв', 'отзыва', 'отзывов')} · все по{' '}
                  {isRealtor ? 'завершённым сделкам' : 'завершённым заказам'}
                </p>
                <div className="mt-4 space-y-2.5">
                  {subscales.map((row) => (
                    <div key={row.label} className="flex items-center gap-2.5">
                      <span className="w-28 shrink-0 text-[13px] text-muted-foreground">
                        {row.label}
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                        <span
                          className="block h-full rounded-full bg-foreground/45"
                          style={{ width: `${(row.value / 5) * 100}%` }}
                        />
                      </span>
                      <span className="w-7 text-right text-[13px] font-semibold">
                        {row.value.toFixed(1).replace('.', ',')}
                      </span>
                    </div>
                  ))}
                </div>
              </aside>
              <div className="space-y-4">
                {ownReviews.map((r) => (
                  <ReviewCard
                    key={r.id}
                    review={r}
                    trustLabel={
                      isRealtor ? 'Сделка проведена через Ателье' : 'Заказ выполнен через Ателье'
                    }
                  />
                ))}
                {s.reviewsCount > ownReviews.length ? (
                  <div className="flex justify-center pt-2">
                    <Button variant="secondary">
                      Показать ещё {s.reviewsCount - ownReviews.length}{' '}
                      {plural(s.reviewsCount - ownReviews.length, 'отзыв', 'отзыва', 'отзывов')}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="about">
            <div className="max-w-2xl space-y-6">
              {s.bio ? <p className="text-[15px] leading-relaxed">{s.bio}</p> : null}
              <div>
                <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  Подтверждено
                </h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {s.verified ? (
                    <Badge variant="accent" size="md">
                      Личность подтверждена
                    </Badge>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Специалист ещё не проходил верификацию.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
      <SiteFooter className={viewer?.specialistSlug !== s.slug ? 'max-sm:pb-24' : undefined} />

      {/* мобильный CTA в зоне большого пальца; владельцу заявка себе не нужна */}
      {viewer?.specialistSlug !== s.slug ? (
        <div
          data-fixed-bar
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:hidden"
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 pl-1">
              <p className="truncate text-[13px] font-semibold">{s.name}</p>
              <p className="truncate text-xs text-muted-foreground">отвечает {s.responseTime}</p>
            </div>
            <Button asChild size="lg" className="flex-[1.4]">
              <a href={`/contact/${s.slug}`}>Отправить заявку</a>
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}
