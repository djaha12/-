import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BriefForm } from '@/components/brief-form'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { getSessionUser } from '@/server/auth'
import { getDistricts } from '@/server/data'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Новый бриф' }

export default async function NewBriefPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const districts = await getDistricts()

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 pb-20 sm:px-6">
        <h1 className="pt-10 font-display text-[32px] leading-[1.12] font-semibold tracking-tight sm:text-4xl">
          Новый бриф
        </h1>
        <p className="mt-2 mb-8 text-sm leading-relaxed text-muted-foreground">
          Опишите задачу один раз — специалисты откликнутся сами, с примерами работ и оценкой.
        </p>
        <BriefForm districts={districts} />
      </main>
      <SiteFooter />
    </>
  )
}
