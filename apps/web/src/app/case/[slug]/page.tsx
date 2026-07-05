import Image from 'next/image'
import Link from 'next/link'
import { Images, MapPin, Share2 } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BeforeAfterSlider } from '@/components/before-after-slider'
import { CaseCard } from '@/components/case-card'
import { ReviewCard } from '@/components/review-card'
import { SaveButton } from '@/components/save-button'
import { VerifiedBadge } from '@/components/verified-badge'
import { caseBySlug, cases, img, reviews, specialistBySlug } from '@/mock/data'
import { formatBudgetRange } from '@/lib/utils'

const GALLERY = ['g2', 'g3', 'g4', 'g5'] as const
const TEAM = [
  { slug: 'eldar-toktogulov', role: '3D-визуализация' },
  { slug: 'viktor-li', role: 'Фотосъёмка' },
] as const

export default async function CasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const item = caseBySlug(slug)
  const author = specialistBySlug(item.specialistSlug)
  const hero = img('g1')
  const budget = formatBudgetRange(item.budgetFrom, item.budgetTo)
  const related = cases.filter((c) => c.id !== item.id).slice(1, 5)
  const review = reviews[0]

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1160px] px-4 pb-28 sm:px-6 md:pb-20">
        <header className="pt-8 sm:pt-12">
          <div className="flex flex-wrap items-center gap-2">
            {/* нейтральные чипы как в профиле; accent-soft — только интерактиву */}
            {item.styles.map((st) => (
              <Badge key={st} variant="neutral" size="md">
                {st}
              </Badge>
            ))}
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-4" aria-hidden />
              {item.location}
            </span>
          </div>
          <h1 className="mt-3 max-w-3xl font-display text-[32px] leading-[1.12] font-semibold tracking-tight text-balance sm:text-5xl">
            {item.title}
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
                  {author.profession} · {author.city}
                </span>
              </span>
            </Link>
            {/* один primary на экран: на десктопе — sticky-панель, на мобиле — нижний бар */}
            <div className="flex shrink-0 items-center gap-2">
              <SaveButton className="rounded-full border border-border-strong bg-surface hover:bg-surface-muted" />
              <Button variant="secondary" size="icon" aria-label="Поделиться кейсом">
                <Share2 />
              </Button>
            </div>
          </div>
        </header>

        <section aria-label="Галерея проекта" className="mt-7">
          <div className="overflow-hidden rounded-xl bg-surface-muted sm:rounded-2xl">
            <Image
              src={hero.src}
              alt={`${item.title} — главное фото`}
              width={hero.width}
              height={hero.height}
              priority
              placeholder="blur"
              blurDataURL={hero.blurDataURL}
              sizes="(max-width: 1160px) 100vw, 1160px"
              className="block w-full"
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            {GALLERY.map((id, i) => {
              const image = img(id)
              const last = i === GALLERY.length - 1
              return (
                <div
                  key={id}
                  className="relative aspect-[3/2] overflow-hidden rounded-xl bg-surface-muted"
                >
                  <Image
                    src={image.src}
                    alt={`${item.title} — фото ${i + 2}`}
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
                      Все 12 фото
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>

        <section aria-label="Параметры проекта" className="mt-8">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
            {[
              { dt: 'Площадь', dd: `${item.areaM2} м²`, sub: '2 комнаты + кухня-гостиная' },
              { dt: 'Бюджет', dd: budget.som, sub: budget.usd },
              { dt: 'Срок', dd: '3,5 месяца', sub: 'от обмеров до сдачи' },
              { dt: 'Роль', dd: 'Полный дизайн-проект', sub: 'с авторским надзором' },
            ].map((p) => (
              <div key={p.dt} className="bg-surface px-4 py-3.5">
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {p.dt}
                </dt>
                <dd className="mt-1 text-[15px] font-bold sm:text-base">{p.dd}</dd>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.sub}</p>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            До и после
          </h2>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            Потяните ползунок, чтобы сравнить состояние до ремонта и результат.
          </p>
          <BeforeAfterSlider before={img('ba-before')} after={img('ba-after')} className="mt-5" />
        </section>

        <section className="mt-12 grid gap-10 lg:grid-cols-[1fr_360px]">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              О проекте
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-foreground/90 sm:text-base">
              <p>
                Пара переехала из съёмной квартиры и хотела «спокойный лофт»: бетон и дерево, но
                без холодности. Мы сохранили открытую планировку, подняли свет тремя сценариями и
                собрали кухню-гостиную вокруг острова — это центр дома, здесь завтракают и
                принимают гостей.
              </p>
              <p>
                Бюджет держали публично в смете: локальные материалы там, где это не влияет на
                результат, и точечные акценты — латунь, травертин, свет Astep. Сдача — за 3,5
                месяца, еженедельные чек-поинты с фото фиксировались прямо в заказе на Ателье.
              </p>
            </div>

            <h2 className="mt-10 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Команда проекта
            </h2>
            <ul className="mt-4 flex flex-wrap gap-3">
              {TEAM.map((m) => {
                const t = specialistBySlug(m.slug)
                return (
                  <li key={m.slug}>
                    <Link
                      href={`/s/${t.slug}`}
                      className="flex items-center gap-3 rounded-full border border-border bg-surface py-2 pr-5 pl-2 transition-colors hover:border-border-strong"
                    >
                      <Avatar name={t.name} className="size-9" />
                      <span>
                        <span className="block text-sm font-semibold">{t.name}</span>
                        <span className="block text-xs text-muted-foreground">{m.role}</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>

            {review ? (
              <>
                <h2 className="mt-10 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  Отзыв клиента
                </h2>
                <div className="mt-4">
                  <ReviewCard review={review} />
                </div>
              </>
            ) : null}
          </div>

          <aside className="h-fit rounded-2xl border border-border bg-surface p-6 max-md:hidden lg:sticky lg:top-24">
            <p className="font-display text-xl font-semibold tracking-tight">
              Хотите похожий проект?
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Опишите задачу — {author.name.split(' ')[0]} ответит в течение {author.responseTime.replace('~', '')}.
              Это бесплатно и ни к чему не обязывает.
            </p>
            <Button size="lg" className="mt-4 w-full">
              Отправить заявку
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Телефон откроется после отклика специалиста
            </p>
          </aside>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Похожие проекты
          </h2>
          {/* ровная сетка: masonry только в ленте */}
          <div className="mt-5 grid grid-cols-2 gap-5 lg:grid-cols-4">
            {related.map((c) => (
              <CaseCard key={c.id} item={c} frame="fixed" />
            ))}
          </div>
        </section>
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
          <Button size="lg" className="flex-[1.4]">
            Отправить заявку
          </Button>
        </div>
      </div>
    </>
  )
}
