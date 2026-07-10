import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CaseWizard } from '@/components/case-wizard'
import { getDict } from '@/i18n/server'
import { getSessionUser } from '@/server/auth'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Новый кейс',
}

export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; type?: string }>
}) {
  const { step, type } = await searchParams
  const user = await getSessionUser()
  // регистрация в момент ценности; новичок сначала собирает профиль (M6.2)
  if (!user) redirect('/login?next=/new')
  if (!user.specialistSlug) redirect('/onboarding')
  const { t } = await getDict()

  return (
    <>
      {/* фокус-режим: ничего лишнего, выход всегда под рукой */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4 sm:px-6">
          <span className="font-display text-[22px] font-semibold tracking-tight">
            {t.wizard.newCaseTitle}
          </span>
          <Button asChild variant="ghost" size="icon" aria-label={t.wizard.closeWizard}>
            <Link href={`/s/${user.specialistSlug}`}>
              <X />
            </Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pt-8 pb-24 sm:px-6">
        <CaseWizard
          initialStep={step ? Number(step) : 1}
          initialKind={type === 'project' ? 'project' : 'deal'}
        />
      </main>
    </>
  )
}
