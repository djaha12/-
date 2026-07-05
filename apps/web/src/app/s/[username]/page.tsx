import Image from 'next/image'
import { Clock, MapPin, Repeat2, Share2 } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CaseCard } from '@/components/case-card'
import { ReviewCard } from '@/components/review-card'
import { RatingStars } from '@/components/rating-stars'
import { SaveButton } from '@/components/save-button'
import { VerifiedBadge } from '@/components/verified-badge'
import { casesOf, img, reviews, specialistBySlug } from '@/mock/data'
import { formatSom, plural } from '@/lib/utils'

const SUBSCALE_SUMMARY = [
  { label: 'Качество', value: 4.9 },
  { label: 'Сроки', value: 4.7 },
  { label: 'Коммуникация', value: 4.9 },
  { label: 'Бюджет', value: 4.8 },
]

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { username } = await params
  const { tab } = await searchParams
  const s = specialistBySlug(username)
  const cover = img('cover1')
  const ownCases = casesOf(s.slug)

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1160px] px-4 pb-24 sm:px-6">
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
                </h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-muted-foreground">
                  <span>{s.profession}</span>
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
              <Button size="lg" className="max-sm:flex-1">
                Отправить заявку
              </Button>
              <SaveButton className="rounded-full border border-border-strong bg-surface hover:bg-surface-muted" />
              <Button variant="secondary" size="icon" aria-label="Поделиться профилем">
                <Share2 />
              </Button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {s.styles.map((st) => (
              <Badge key={st} variant="neutral" size="md">
                {st}
              </Badge>
            ))}
            <Badge variant="outline" size="md">
              от {formatSom(s.priceFrom)}/м²
            </Badge>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
            {[
              {
                dt: 'Рейтинг',
                dd: (
                  <span className="flex items-center gap-1.5">
                    <span className="text-lg font-bold">{s.rating.toFixed(1).replace('.', ',')}</span>
                    <RatingStars value={s.rating} size={13} />
                  </span>
                ),
                sub: `${s.reviewsCount} ${plural(s.reviewsCount, 'отзыв', 'отзыва', 'отзывов')}`,
              },
              {
                dt: 'Проекты',
                dd: <span className="text-lg font-bold">{s.projectsCount}</span>,
                sub: 'завершены через Ателье',
              },
              {
                dt: 'Повторные клиенты',
                dd: (
                  <span className="flex items-center gap-1.5 text-lg font-bold">
                    <Repeat2 className="size-4.5 text-success" aria-hidden />
                    {s.repeatClientsPct}%
                  </span>
                ),
                sub: 'возвращаются с новым проектом',
              },
              {
                dt: 'Отвечает',
                dd: (
                  <span className="flex items-center gap-1.5 text-lg font-bold">
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
                <p className="mt-0.5 text-xs text-faint-foreground">{item.sub}</p>
              </div>
            ))}
          </dl>
        </header>

        <Tabs defaultValue={tab ?? 'cases'} className="mt-8">
          <TabsList>
            <TabsTrigger value="cases">
              Кейсы <span className="text-faint-foreground">{ownCases.length}</span>
            </TabsTrigger>
            <TabsTrigger value="reviews">
              Отзывы <span className="text-faint-foreground">{s.reviewsCount}</span>
            </TabsTrigger>
            <TabsTrigger value="about">О специалисте</TabsTrigger>
          </TabsList>

          <TabsContent value="cases">
            <div className="columns-2 gap-5 lg:columns-3">
              {ownCases.map((c) => (
                <CaseCard key={c.id} item={c} />
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
                  {s.reviewsCount} {plural(s.reviewsCount, 'отзыв', 'отзыва', 'отзывов')} · все по
                  завершённым заказам
                </p>
                <div className="mt-4 space-y-2.5">
                  {SUBSCALE_SUMMARY.map((row) => (
                    <div key={row.label} className="flex items-center gap-2.5">
                      <span className="w-28 shrink-0 text-[13px] text-muted-foreground">
                        {row.label}
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                        <span
                          className="block h-full rounded-full bg-accent"
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
                {reviews.map((r) => (
                  <ReviewCard key={r.id} review={r} />
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="about">
            <div className="max-w-2xl space-y-6">
              <p className="text-[15px] leading-relaxed">{s.bio}</p>
              <div>
                <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  Подтверждено
                </h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="accent" size="md">
                    Личность подтверждена
                  </Badge>
                  <Badge variant="accent" size="md">
                    Патент ИП
                  </Badge>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </>
  )
}
