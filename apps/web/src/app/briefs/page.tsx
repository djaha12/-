import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import { BriefCard } from '@/components/brief-card'
import { EmptyState } from '@/components/empty-state'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Button } from '@/components/ui/button'
import { getSessionUser } from '@/server/auth'
import { getMyBriefs, getOpenBriefs } from '@/server/data'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Брифы' }

/**
 * Одна страница — две роли. Специалист видит ленту открытых задач клиентов,
 * клиент — свои брифы и отклики на них.
 */
export default async function BriefsPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const isSpecialist = user.specialistSlug != null
  const briefs = isSpecialist ? await getOpenBriefs(user.id) : await getMyBriefs(user.id)
  // риелтор тоже бывает клиентом (продаёт своё) — его брифы не должны потеряться
  const ownBriefs = isSpecialist ? await getMyBriefs(user.id) : []

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 pb-20 sm:px-6">
        {/* на 390 кнопка уходит под подзаголовок, не зажимая текст в колонку */}
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-4 pt-10 pb-6">
          <div className="basis-full sm:basis-auto sm:flex-1">
            <h1 className="font-display text-[32px] leading-[1.12] font-semibold tracking-tight sm:text-4xl">
              {isSpecialist ? 'Брифы' : 'Мои брифы'}
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              {isSpecialist
                ? 'Открытые задачи клиентов. Откликнитесь с примерами работ — клиент сам откроет чат.'
                : 'Опишите задачу один раз — специалисты откликнутся с примерами работ и оценкой.'}
            </p>
          </div>
          {!isSpecialist && briefs.length > 0 ? (
            <Button asChild className="shrink-0">
              <Link href="/briefs/new">Создать бриф</Link>
            </Button>
          ) : null}
        </div>

        {briefs.length === 0 ? (
          isSpecialist ? (
            <EmptyState
              icon={ClipboardList}
              title="Открытых брифов пока нет"
              description="Клиенты публикуют здесь задачи: продать квартиру, подготовить к продаже, сделать проект. Загляните позже."
            />
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="У вас пока нет брифов"
              description="Бриф — это ваша задача одним постом: специалисты откликаются сами, вы выбираете по работам и отзывам."
              actionLabel="Создать бриф"
              actionHref="/briefs/new"
            />
          )
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {briefs.map((b) => (
              <BriefCard key={b.id} brief={b} variant={isSpecialist ? 'feed' : 'mine'} />
            ))}
          </ul>
        )}

        {ownBriefs.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-4 font-display text-xl font-semibold">Мои брифы</h2>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {ownBriefs.map((b) => (
                <BriefCard key={b.id} brief={b} variant="mine" />
              ))}
            </ul>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </>
  )
}
