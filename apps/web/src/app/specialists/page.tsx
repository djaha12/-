import type { Metadata } from 'next'
import { ChevronDown } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { SpecialistCard } from '@/components/specialist-card'
import { casesOf, specialists } from '@/mock/data'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Специалисты',
  description:
    'Риелторы, дизайнеры интерьера, архитекторы и команды Кыргызстана — с проверяемой историей работ и отзывами по завершённым заказам.',
}

// риелторы — приоритетная вертикаль: сразу после «Все»
const FILTERS = [
  'Все',
  'Риелторы',
  'Дизайн интерьера',
  'Архитектура',
  'Ландшафт',
  'Хоумстейджинг',
  '3D',
  'Фото',
]

/** риелторы первыми, дальше — по рейтингу; пустые портфолио в конец */
const ordered = [...specialists].sort((a, b) => {
  const aEmpty = casesOf(a.slug).length === 0 ? 1 : 0
  const bEmpty = casesOf(b.slug).length === 0 ? 1 : 0
  if (aEmpty !== bEmpty) return aEmpty - bEmpty
  const aRealtor = a.dealStats ? 1 : 0
  const bRealtor = b.dealStats ? 1 : 0
  if (aRealtor !== bRealtor) return bRealtor - aRealtor
  return b.rating - a.rating || b.reviewsCount - a.reviewsCount
})

export default function SpecialistsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1160px] px-4 pb-20 sm:px-6">
        <section className="pt-10 pb-6 sm:pt-14">
          <h1 className="font-display text-[32px] leading-[1.12] font-semibold tracking-tight sm:text-5xl">
            Специалисты
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            Выбирайте по реальным работам и отзывам — они оставляются только по завершённым
            заказам.
          </p>
        </section>

        <section
          aria-label="Фильтры"
          className="sticky top-16 z-30 -mx-4 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6"
        >
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTERS.map((f, i) => (
              <button
                key={f}
                type="button"
                aria-pressed={i === 0}
                className={cn(
                  'inline-flex h-11 shrink-0 cursor-pointer items-center gap-1 rounded-full border px-4 text-sm font-medium transition-colors duration-150',
                  i === 0
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
                )}
              >
                {f}
              </button>
            ))}
            <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
            <button
              type="button"
              className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-border bg-surface px-4 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:border-border-strong hover:text-foreground"
            >
              Район
              <ChevronDown className="size-4 opacity-60" aria-hidden />
            </button>
          </div>
        </section>

        <section aria-label="Список специалистов" className="mt-6 grid gap-5 lg:grid-cols-2">
          {ordered.map((s) => (
            <SpecialistCard key={s.slug} specialist={s} />
          ))}
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
