import type { Metadata } from 'next'
import Link from 'next/link'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CaseWizard } from '@/components/case-wizard'

export const metadata: Metadata = {
  title: 'Новый кейс',
}

export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; type?: string }>
}) {
  const { step, type } = await searchParams

  return (
    <>
      {/* фокус-режим: ничего лишнего, выход всегда под рукой */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4 sm:px-6">
          <span className="font-display text-[22px] font-semibold tracking-tight">Новый кейс</span>
          <Button asChild variant="ghost" size="icon" aria-label="Закрыть мастер">
            <Link href="/s/nurlan-abdykadyrov">
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
