import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { X } from 'lucide-react'
import { prisma } from '@atelier/db'
import { Button } from '@/components/ui/button'
import { OnboardingWizard, type OnboardingPrefill } from '@/components/onboarding-wizard'
import { getDict } from '@/i18n/server'
import { getSessionUser } from '@/server/auth'
import { getDistricts } from '@/server/data'
import { makeLinkToken, TELEGRAM_BOT_USERNAME } from '@/server/telegram'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Профиль специалиста' }

export default async function OnboardingPage() {
  const user = await getSessionUser()
  // регистрация в момент ценности: мастер требует входа, intent переживает логин
  if (!user) redirect('/login?next=/onboarding')

  const [profile, districts] = await Promise.all([
    prisma.specialistProfile.findUnique({
      where: { userId: user.id },
      include: { expertiseDistricts: { include: { district: true } } },
    }),
    getDistricts(),
  ])
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { telegramChatId: true },
  })
  const linkToken = makeLinkToken(user.id)
  const prefill: OnboardingPrefill = {
    displayName: user.displayName ?? '',
    specialization: profile?.specialization ?? null,
    worksAt: profile?.worksAtLabel ?? '',
    districtSlugs: profile?.expertiseDistricts.map((d) => d.district.slug) ?? [],
    isEdit: Boolean(profile),
    telegramLinked: Boolean(row?.telegramChatId),
    telegramDeepLink:
      TELEGRAM_BOT_USERNAME && linkToken
        ? `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${linkToken}`
        : null,
  }

  const { t } = await getDict()

  return (
    <>
      {/* фокус-режим, как в мастере кейса: ничего лишнего, выход под рукой */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4 sm:px-6">
          <span className="font-display text-[22px] font-semibold tracking-tight">
            {prefill.isEdit ? t.onboarding.headerEdit : t.onboarding.headerNew}
          </span>
          <Button asChild variant="ghost" size="icon" aria-label={t.wizard.closeWizard}>
            <Link href={user.specialistSlug ? `/s/${user.specialistSlug}` : '/'}>
              <X />
            </Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pt-8 pb-24 sm:px-6">
        {!prefill.isEdit ? (
          <p className="mb-6 rounded-xl bg-surface-muted px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            {t.onboarding.intro}
          </p>
        ) : null}
        <OnboardingWizard prefill={prefill} districts={districts} />
      </main>
    </>
  )
}
