import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { X } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ContactForm } from '@/components/contact-form'
import { VerifiedBadge } from '@/components/verified-badge'
import { getSessionUser } from '@/server/auth'
import { getSpecialist } from '@/server/data'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Заявка' }

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ case?: string }>
}) {
  const { slug } = await params
  const { case: caseSlug } = await searchParams
  const user = await getSessionUser()
  // регистрация в момент ценности: заявка требует входа
  if (!user) redirect('/login')
  const data = await getSpecialist(slug)
  if (!data) notFound()
  const s = data.specialist
  const aboutCase = caseSlug ? data.cases.find((c) => c.slug === caseSlug) : undefined

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4 sm:px-6">
          <span className="font-display text-[22px] font-semibold tracking-tight">Заявка</span>
          <Button asChild variant="ghost" size="icon" aria-label="Закрыть">
            <Link href={caseSlug ? `/case/${caseSlug}` : `/s/${slug}`}>
              <X />
            </Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pt-8 pb-24 sm:px-6">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
          <Avatar name={s.name} className="size-12" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-semibold">
              {s.name}
              {s.verified ? <VerifiedBadge /> : null}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {s.profession} · отвечает {s.responseTime}
            </p>
          </div>
        </div>

        {aboutCase ? (
          <p className="mt-3 rounded-xl bg-surface-muted px-4 py-3 text-sm text-muted-foreground">
            По кейсу: <span className="font-medium text-foreground">{aboutCase.title}</span>
          </p>
        ) : null}

        <ContactForm specialistSlug={slug} caseSlug={caseSlug} isRealtor={Boolean(s.dealStats)} />

        <p className="mt-4 text-center text-[13px] text-muted-foreground">
          Телефон специалиста откроется после его отклика. Это бесплатно и ни к чему не обязывает.
        </p>
      </main>
    </>
  )
}
