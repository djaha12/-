import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BadgeCheck, Images, MapPin } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BeforeAfterSlider } from '@/components/before-after-slider'
import { CaseCard, DEAL_TYPE_LABEL, dealOutcomeLabel } from '@/components/case-card'
import { JsonLd } from '@/components/json-ld'
import { ReportButton } from '@/components/report-button'
import { ReviewCard } from '@/components/review-card'
import { SaveButton } from '@/components/save-button'
import { ShareButton } from '@/components/share-button'
import { VerifiedBadge } from '@/components/verified-badge'
import { getSessionUser } from '@/server/auth'
import { getCase, markSaved } from '@/server/data'
import { formatBudgetRange, formatDealPrice, plural } from '@/lib/utils'
import { SITE_URL } from '@/lib/site'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const data = await getCase(slug)
  if (!data) return { title: 'Кейс не найден', robots: { index: false } }
  const { item, author } = data
  const deal = item.deal
  const description = deal
    ? [
        deal.confirmed ? 'Сделка подтверждена клиентом.' : null,
        deal.daysOnMarket ? `Продано за ${deal.daysOnMarket} дн.` : null,
        `${item.location}.`,
        `${author.name} — ${author.profession.toLowerCase()} на Ателье.`,
      ]
        .filter(Boolean)
        .join(' ')
    : `${item.location}. ${author.name} — ${author.profession.toLowerCase()} на Ателье: реальные проекты и честные отзывы.`
  return {
    title: item.title,
    description,
    alternates: { canonical: `${SITE_URL}/case/${slug}` },
    openGraph: {
      title: item.title,
      description,
      url: `${SITE_URL}/case/${slug}`,
      images: [{ url: `/api/og/case/${slug}`, width: 1200, height: 630 }],
    },
  }
}

export default async function CasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const viewer = await getSessionUser()
  // автор и модератор видят и неопубликованный кейс (баннер статуса ниже)
  const data = await getCase(slug, viewer)
  if (!data) notFound()

  const { item: rawItem, author, gallery, beforeAfter, review, story, moderation } = data
  const [item] = await markSaved([rawItem], viewer?.id)
  const related = await markSaved(data.related, viewer?.id)
  const deal = item!.deal

  const hero = gallery[1] ?? gallery[0] ?? item!.image
  const grid = gallery.slice(2, 6)
  const price = deal?.price
    ? formatDealPrice(deal.price, { monthly: deal.type === 'rentOut' })
    : null
  const budget =
    !deal && item!.budgetFrom > 0 ? formatBudgetRange(item!.budgetFrom, item!.budgetTo) : null

  // big: итог сделки (цена + скорость) крупнее служебного контекста
  const paramItems = deal
    ? [
        ...(price
          ? [
              {
                dt: deal.type === 'rentOut' ? 'Ставка' : 'Цена сделки',
                dd: price.som,
                sub: price.usd,
                big: true,
              },
            ]
          : deal.priceFrom && deal.priceTo
            ? [
                {
                  dt: 'Цена сделки',
                  dd: formatBudgetRange(deal.priceFrom, deal.priceTo).som,
                  sub: 'публикуется вилкой',
                  big: true,
                },
              ]
            : [{ dt: 'Бюджет', dd: 'Под задачу клиента', sub: 'вилка не публикуется' }]),
        ...(deal.daysOnMarket
          ? [
              {
                dt: 'Срок на рынке',
                dd: `${deal.daysOnMarket} ${plural(deal.daysOnMarket, 'день', 'дня', 'дней')}`,
                // честная атрибуция: без заказа на платформе срок — со слов риелтора
                sub: deal.confirmed
                  ? deal.type === 'rentOut'
                    ? 'от публикации до договора'
                    : 'от публикации до задатка'
                  : 'по данным риелтора',
                big: true,
              },
            ]
          : []),
        {
          dt: 'Тип',
          dd: `${DEAL_TYPE_LABEL[deal.type]} · ${deal.propertyType}`,
          sub: item!.areaM2 ? `${item!.areaM2} м²` : '—',
        },
        { dt: 'Локация', dd: item!.location, sub: 'точный адрес — после заявки' },
      ]
    : [
        ...(item!.areaM2 ? [{ dt: 'Площадь', dd: `${item!.areaM2} м²`, sub: 'по обмерам' }] : []),
        ...(budget ? [{ dt: 'Бюджет', dd: budget.som, sub: budget.usd }] : []),
        { dt: 'Роль', dd: 'Полный дизайн-проект', sub: 'с авторским надзором' },
        { dt: 'Локация', dd: item!.location, sub: 'город и район' },
      ]

  const beforeAfterCopy = deal
    ? {
        title: 'Подготовка к продаже',
        text: 'Слева — объект в старом объявлении, справа — после хоумстейджинга и съёмки. Подготовка сократила срок продажи и подняла цену.',
      }
    : {
        title: 'До и после',
        text: 'Потяните ползунок, чтобы сравнить состояние до ремонта и результат.',
      }

  const cta = deal
    ? {
        title:
          deal.type === 'buyAssist' ? 'Ищете квартиру под задачу?' : 'Продаёте похожий объект?',
        text: `Опишите объект — ${author.name.split(' ')[0]} ответит в течение ${author.responseTime.replace('~', '')}. Оценка и план продажи — бесплатно.`,
      }
    : {
        title: 'Хотите похожий проект?',
        text: `Опишите задачу — ${author.name.split(' ')[0]} ответит в течение ${author.responseTime.replace('~', '')}. Это бесплатно и ни к чему не обязывает.`,
      }

  return (
    <>
      <SiteHeader />
      {!moderation ? (
        <>
          <JsonLd
            data={{
              '@context': 'https://schema.org',
              '@type': 'CreativeWork',
              name: item!.title,
              url: `${SITE_URL}/case/${item!.slug}`,
              ...(item!.image.src ? { image: `${SITE_URL}${item!.image.src}` } : {}),
              author: {
                '@type': 'Person',
                name: author.name,
                jobTitle: author.profession,
                url: `${SITE_URL}/s/${author.slug}`,
              },
              locationCreated: { '@type': 'Place', name: item!.location },
            }}
          />
          <JsonLd
            data={{
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Ателье', item: SITE_URL },
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: deal ? 'Сделки' : 'Проекты',
                  item: `${SITE_URL}/?type=${deal ? 'deals' : 'projects'}`,
                },
                { '@type': 'ListItem', position: 3, name: item!.title },
              ],
            }}
          />
        </>
      ) : null}
      <main className="mx-auto max-w-[1160px] px-4 pb-28 sm:px-6 md:pb-20">
        {moderation ? (
          <div
            className={`mt-6 rounded-xl border px-4 py-3.5 text-sm leading-relaxed ${
              moderation.state === 'PENDING_REVIEW'
                ? 'border-transparent bg-accent-soft text-accent-soft-foreground'
                : 'border-border bg-surface-muted text-muted-foreground'
            }`}
          >
            {moderation.state === 'PENDING_REVIEW' ? (
              <>
                <span className="font-semibold">Кейс на проверке.</span> Обычно это занимает до
                пары часов — после одобрения он появится в ленте и на витрине. Виден только вам.
              </>
            ) : moderation.state === 'REJECTED' ? (
              <>
                <span className="font-semibold text-foreground">Кейс отклонён модерацией.</span>{' '}
                {moderation.reason ? `Причина: ${moderation.reason}` : 'Причина не указана.'}{' '}
                Создайте кейс заново с учётом причины — новый пройдёт проверку.
              </>
            ) : (
              <>
                <span className="font-semibold text-foreground">Кейс скрыт после жалобы.</span>{' '}
                Он не виден в ленте и на витрине. Если считаете это ошибкой — напишите в
                поддержку.
              </>
            )}
          </div>
        ) : null}
        <header className="pt-8 sm:pt-12">
          <div className="flex flex-wrap items-center gap-2">
            {deal ? (
              <>
                {/* на 390 тип/объект дублируют параметры ниже — герой должен начинаться раньше */}
                <Badge variant="neutral" size="md" className="max-sm:hidden">
                  {DEAL_TYPE_LABEL[deal.type]}
                </Badge>
                <Badge variant="neutral" size="md" className="max-sm:hidden">
                  {deal.propertyType}
                </Badge>
                {deal.confirmed ? (
                  <Badge variant="success" size="md">
                    <BadgeCheck aria-hidden />
                    Сделка подтверждена клиентом
                  </Badge>
                ) : null}
              </>
            ) : (
              item!.styles.map((st) => (
                <Badge key={st} variant="neutral" size="md">
                  {st}
                </Badge>
              ))
            )}
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-4" aria-hidden />
              {item!.location}
            </span>
          </div>
          <h1 className="mt-3 max-w-3xl font-display text-[32px] leading-[1.12] font-semibold tracking-tight text-balance sm:text-5xl">
            {item!.title}
          </h1>

          <div className="mt-6 flex items-center justify-between gap-4">
            <Link href={`/s/${author.slug}`} className="group flex min-w-0 items-center gap-3">
              <Avatar name={author.name} className="size-11" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[15px] font-semibold group-hover:underline">
                  {author.name}
                  {author.verified ? <VerifiedBadge /> : null}
                </span>
                <span className="block truncate text-[13px] text-muted-foreground">
                  {author.profession}
                  {author.worksAt ? ` · ${author.worksAt}` : ''} · {author.city}
                </span>
              </span>
            </Link>
            {/* один primary на экран: на десктопе — sticky-панель, на мобиле — нижний бар */}
            <div className="flex shrink-0 items-center gap-2">
              <SaveButton
                caseSlug={item!.slug}
                defaultSaved={item!.savedByMe}
                className="rounded-full border border-border-strong bg-surface hover:bg-surface-muted"
              />
              <ShareButton slug={item!.slug} title={item!.title} />
            </div>
          </div>
        </header>

        <section aria-label="Галерея" className="mt-7">
          <div className="relative overflow-hidden rounded-xl bg-surface-muted sm:rounded-2xl">
            <Image
              src={hero.src}
              alt={`${item!.title} — главное фото`}
              width={hero.width}
              height={hero.height}
              priority
              placeholder="blur"
              blurDataURL={hero.blurDataURL}
              sizes="(max-width: 1160px) 100vw, 1160px"
              className="block w-full"
            />
            {deal && dealOutcomeLabel(deal) ? (
              <span
                title={deal.confirmed ? 'Подтверждена клиентом' : undefined}
                className={`absolute bottom-4 left-4 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold text-white ring-1 ring-white/15 backdrop-blur-sm ${
                  deal.confirmed ? 'bg-[oklch(0.46_0.085_155)]/90' : 'bg-black/70'
                }`}
              >
                {deal.confirmed ? <BadgeCheck className="size-4" aria-hidden /> : null}
                {dealOutcomeLabel(deal)}
                {deal.confirmed ? <span className="sr-only">, подтверждена клиентом</span> : null}
              </span>
            ) : null}
          </div>
          {grid.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-4">
              {grid.map((image, i) => {
                const last = i === grid.length - 1 && gallery.length > 6
                return (
                  <div
                    key={image.src}
                    className="relative aspect-[3/2] overflow-hidden rounded-xl bg-surface-muted"
                  >
                    <Image
                      src={image.src}
                      alt={`${item!.title} — фото ${i + 2}`}
                      fill
                      placeholder="blur"
                      blurDataURL={image.blurDataURL}
                      sizes="(max-width: 1160px) 50vw, 580px"
                      className="object-cover"
                    />
                    {last ? (
                      <button
                        type="button"
                        className="absolute inset-0 flex cursor-pointer items-center justify-center gap-2 bg-black/45 font-semibold text-white backdrop-blur-[2px] transition-colors hover:bg-black/55"
                      >
                        <Images className="size-5" aria-hidden />
                        Все {gallery.length} фото
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
        </section>

        <section aria-label="Параметры" className="mt-8">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
            {paramItems.map((p) => (
              <div key={p.dt} className="bg-surface px-4 py-3.5">
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {p.dt}
                </dt>
                <dd
                  className={
                    'big' in p && p.big
                      ? 'mt-1 font-display text-xl font-semibold sm:text-2xl'
                      : 'mt-1 text-[15px] font-bold sm:text-base'
                  }
                >
                  {p.dd}
                </dd>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.sub}</p>
              </div>
            ))}
          </dl>
        </section>

        {beforeAfter ? (
          <section className="mt-12">
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {beforeAfterCopy.title}
            </h2>
            <p className="mt-1.5 max-w-2xl text-[15px] text-muted-foreground">
              {beforeAfterCopy.text}
            </p>
            <BeforeAfterSlider
              before={beforeAfter.before}
              after={beforeAfter.after}
              className="mt-5 sm:rounded-2xl"
            />
          </section>
        ) : null}

        <section className="mt-12 grid gap-10 lg:grid-cols-[1fr_360px]">
          <div>
            {story.length > 0 ? (
              <>
                <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  {deal ? 'Как прошла сделка' : 'О проекте'}
                </h2>
                <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-foreground/90 sm:text-base">
                  {story.map((p) => (
                    <p key={p.slice(0, 24)}>{p}</p>
                  ))}
                </div>
              </>
            ) : null}

            {review ? (
              <>
                <h2 className={`${story.length > 0 ? 'mt-10 ' : ''}font-display text-2xl font-semibold tracking-tight sm:text-3xl`}>
                  {deal ? 'Отзыв клиента по сделке' : 'Отзыв клиента'}
                </h2>
                <div className="mt-4">
                  <ReviewCard
                    review={review}
                    trustLabel={
                      deal ? 'Сделка проведена через Ателье' : 'Заказ выполнен через Ателье'
                    }
                  />
                </div>
              </>
            ) : null}
          </div>

          <aside className="h-fit rounded-2xl border border-border bg-surface p-6 max-md:hidden lg:sticky lg:top-24">
            <p className="font-display text-xl font-semibold tracking-tight">{cta.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{cta.text}</p>
            <Button asChild size="lg" className="mt-4 w-full">
              <Link href={`/contact/${author.slug}?case=${item!.slug}`}>Отправить заявку</Link>
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Телефон откроется после отклика специалиста
            </p>
          </aside>
        </section>

        {/* ценностное предложение на мобильном: aside скрыт, бар несёт только кнопку */}
        <section className="mt-10 rounded-2xl border border-border bg-surface p-5 md:hidden">
          <p className="font-display text-lg font-semibold tracking-tight">{cta.title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{cta.text}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Телефон откроется после отклика специалиста
          </p>
        </section>

        {/* жалоба — тихо в подвале контента кейса (до чужих карточек); работает и для гостей */}
        {!moderation ? (
          <div className="mt-12">
            <ReportButton caseSlug={item!.slug} />
          </div>
        ) : null}

        {related.length > 0 ? (
          <section className="mt-12">
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {deal ? 'Другие сделки' : 'Похожие проекты'}
            </h2>
            {/* ровная сетка: masonry только в ленте */}
            <div className="mt-5 grid grid-cols-2 gap-5 lg:grid-cols-4">
              {related.map((c) => (
                <CaseCard key={c.id} item={c} frame="fixed" hideAuthor={Boolean(deal)} />
              ))}
            </div>
          </section>
        ) : null}
      </main>
      <SiteFooter className="max-md:pb-24" />

      {/* мобильный CTA в зоне большого пальца */}
      <div
        data-fixed-bar
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 pl-1">
            <p className="truncate text-[13px] font-semibold">{author.name}</p>
            <p className="truncate text-xs text-muted-foreground">отвечает {author.responseTime}</p>
          </div>
          <Button asChild size="lg" className="flex-[1.4]">
            <Link href={`/contact/${author.slug}?case=${item!.slug}`}>Отправить заявку</Link>
          </Button>
        </div>
      </div>
    </>
  )
}
