import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { FolderPlus } from 'lucide-react'
import { CaseCard } from '@/components/case-card'
import { EmptyState } from '@/components/empty-state'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { getSessionUser } from '@/server/auth'
import { getSavedCases } from '@/server/data'
import { plural } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Сохранённое' }

export default async function SavedPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const items = await getSavedCases(user.id)

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[1360px] px-4 pb-20 sm:px-6">
        <section className="pt-10 pb-6 sm:pt-14">
          <h1 className="font-display text-[32px] leading-[1.12] font-semibold tracking-tight sm:text-5xl">
            Сохранённое
          </h1>
          <p className="mt-3 text-[15px] text-muted-foreground sm:text-base">
            {items.length > 0
              ? `${items.length} ${plural(items.length, 'кейс', 'кейса', 'кейсов')} — ваша коллекция идей и специалистов`
              : 'Коллекция идей и специалистов, которые вам понравились'}
          </p>
        </section>

        {items.length === 0 ? (
          <EmptyState
            icon={FolderPlus}
            title="Пока ничего не сохранено"
            description="Нажимайте закладку на понравившихся кейсах в ленте — они соберутся здесь, чтобы сравнить и выбрать специалиста."
          />
        ) : (
          <section className="columns-2 gap-5 md:columns-3 xl:columns-4">
            {items.map((item) => (
              <CaseCard key={item.id} item={item} />
            ))}
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
