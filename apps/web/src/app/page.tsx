import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { CaseCard } from '@/components/case-card'
import { Skeleton } from '@/components/ui/skeleton'
import { cases } from '@/mock/data'
import { cn } from '@/lib/utils'

const PROFESSIONS = [
  'Все',
  'Интерьер',
  'Архитектура',
  'Ландшафт',
  'Хоумстейджинг',
  '3D-визуализация',
  'Фото',
  'Риелторы',
]

function FilterChip({
  children,
  active = false,
  withChevron = false,
}: {
  children: React.ReactNode
  active?: boolean
  withChevron?: boolean
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-11 shrink-0 cursor-pointer items-center gap-1 rounded-full border px-4 text-sm font-medium transition-colors duration-150',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
      )}
    >
      {children}
      {withChevron ? <ChevronDown className="size-4 opacity-60" aria-hidden /> : null}
    </button>
  )
}

export default function FeedPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1360px] px-4 pb-20 sm:px-6">
        <section className="pt-10 pb-8 sm:pt-14 sm:pb-10">
          <h1 className="max-w-3xl font-display text-[34px] leading-[1.12] font-semibold tracking-tight text-balance sm:text-5xl">
            Реальные проекты. Проверенные специалисты.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            Интерьеры, архитектура и ландшафт Кыргызстана — с отзывами только по завершённым
            заказам.
          </p>
        </section>

        <section
          aria-label="Фильтры"
          className="sticky top-16 z-30 -mx-4 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6"
        >
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PROFESSIONS.map((p, i) => (
              <FilterChip key={p} active={i === 0}>
                {p}
              </FilterChip>
            ))}
            <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
            <FilterChip withChevron>Стиль</FilterChip>
            <FilterChip withChevron>Бюджет</FilterChip>
            <FilterChip>
              <SlidersHorizontal className="size-4" aria-hidden />
              Ещё
            </FilterChip>
          </div>
        </section>

        <section aria-label="Лента проектов" className="mt-6 columns-2 gap-5 md:columns-3 xl:columns-4">
          {cases.map((item) => (
            <CaseCard key={item.id} item={item} />
          ))}
        </section>

        {/* хвост бесконечной ленты: ровная кромка перед футером */}
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={cn(i === 3 && 'md:max-xl:hidden')}>
              <Skeleton className="aspect-[3/4] w-full rounded-xl" />
              <Skeleton className="mt-2.5 h-4 w-3/4" />
              <Skeleton className="mt-2 h-3.5 w-1/2" />
            </div>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
