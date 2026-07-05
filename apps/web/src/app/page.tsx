import Link from 'next/link'
import { BadgeCheck } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { CaseCard } from '@/components/case-card'
import { EmptyState } from '@/components/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchX } from 'lucide-react'
import { getSessionUser } from '@/server/auth'
import { getFeedCases, markSaved } from '@/server/data'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

function ChipLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors duration-150',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
      )}
    >
      {children}
    </Link>
  )
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; confirmed?: string }>
}) {
  const { type, confirmed } = await searchParams
  const kind = type === 'deals' ? 'deals' : type === 'projects' ? 'projects' : undefined
  const confirmedOnly = kind === 'deals' && confirmed === '1'

  const user = await getSessionUser()
  const items = await markSaved(await getFeedCases({ kind, confirmedOnly }), user?.id)

  const base = (t?: string, c?: boolean) => {
    const p = new URLSearchParams()
    if (t) p.set('type', t)
    if (c) p.set('confirmed', '1')
    const s = p.toString()
    return s ? `/?${s}` : '/'
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1360px] px-4 pb-20 sm:px-6">
        <section className="pt-10 pb-8 sm:pt-14 sm:pb-10">
          <h1 className="max-w-3xl font-display text-[34px] leading-[1.12] font-semibold tracking-tight text-balance sm:text-5xl">
            Реальные проекты. Проверенные специалисты.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
            Интерьеры, архитектура и сделки риелторов Кыргызстана — с отзывами только по
            завершённым заказам.
          </p>
        </section>

        <section
          aria-label="Фильтры"
          className="sticky top-16 z-30 -mx-4 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6"
        >
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ChipLink href={base()} active={!kind}>
              Все
            </ChipLink>
            <ChipLink href={base('deals')} active={kind === 'deals' && !confirmedOnly}>
              Сделки риелторов
            </ChipLink>
            <ChipLink href={base('projects')} active={kind === 'projects'}>
              Проекты
            </ChipLink>
            {kind === 'deals' ? (
              <>
                <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
                <ChipLink href={base('deals', !confirmedOnly)} active={confirmedOnly}>
                  <BadgeCheck className="size-4" aria-hidden />
                  Подтверждённые клиентом
                </ChipLink>
              </>
            ) : null}
          </div>
        </section>

        {items.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              icon={SearchX}
              title="Здесь пока пусто"
              description="По этому фильтру ничего не нашлось. Посмотрите все проекты — или станьте первым, кто опубликует такой кейс."
            />
          </div>
        ) : (
          <>
            <section
              aria-label="Лента проектов"
              className="mt-6 columns-2 gap-5 md:columns-3 xl:columns-4"
            >
              {items.map((item) => (
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
          </>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
