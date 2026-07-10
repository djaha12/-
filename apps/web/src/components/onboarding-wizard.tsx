'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, ImagePlus, Send } from 'lucide-react'
import { MAX_EXPERTISE_DISTRICTS } from '@atelier/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TelegramLinkButton } from '@/components/telegram-link'
import { useI18n } from '@/i18n/client'
import { fmt } from '@/i18n/dictionaries'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

/**
 * Онбординг специалиста (M6.2, docs/05 §3.2): ≤ 7 минут от «я риелтор» до
 * профиля с районами и первой сделки. Риелтор — первая карточка (realtor-first).
 * Повторный заход = редактирование (идемпотентный profiles.setup).
 */

export interface OnboardingPrefill {
  displayName: string
  specialization: string | null
  worksAt: string
  districtSlugs: string[]
  isEdit: boolean
  telegramLinked: boolean
  /** deep-link привязки бота; null — бот не настроен */
  telegramDeepLink: string | null
}

// лейблы — из словаря t.specializations: онбординг и каталог называют роли одинаково
const SPECIALIZATION_CODES = [
  'REALTOR',
  'INTERIOR_DESIGNER',
  'ARCHITECT',
  'DECORATOR_STAGER',
  'VISUALIZER_3D',
  'PHOTO_VIDEO',
  'LANDSCAPE_DESIGNER',
] as const
type Spec = (typeof SPECIALIZATION_CODES)[number]

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-disabled={disabled || undefined}
      onClick={onClick}
      className={cn(
        'inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-150',
        active
          ? 'cursor-pointer border-foreground bg-foreground text-background'
          : disabled
            ? // лимит достигнут: не притворяемся кликабельными
              'cursor-default border-border bg-surface text-muted-foreground opacity-45'
            : 'cursor-pointer border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function OnboardingWizard({
  prefill,
  districts,
}: {
  prefill: OnboardingPrefill
  districts: Array<{ slug: string; name: string }>
}) {
  const { t } = useI18n()
  const steps = [t.onboarding.stepAbout, t.onboarding.stepDistricts, t.onboarding.stepDone]
  const router = useRouter()
  const [step, setStep] = React.useState(1)
  const [name, setName] = React.useState(prefill.displayName)
  const [spec, setSpec] = React.useState<Spec>((prefill.specialization as Spec) ?? 'REALTOR')
  const [worksAt, setWorksAt] = React.useState(prefill.worksAt)
  const [selected, setSelected] = React.useState<string[]>(prefill.districtSlugs)

  const setup = trpc.profiles.setup.useMutation({
    onSuccess: () => {
      router.refresh()
      setStep(3)
    },
  })

  const toggleDistrict = (slug: string) =>
    setSelected((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : prev.length < MAX_EXPERTISE_DISTRICTS
          ? [...prev, slug]
          : prev,
    )

  const canNext = step === 1 ? name.trim().length >= 2 : true
  const submit = () =>
    setup.mutate({
      displayName: name.trim(),
      specialization: spec,
      worksAt: worksAt.trim() || undefined,
      districtSlugs: selected,
    })

  return (
    <div>
      <ol className="flex items-center gap-2" aria-label={t.onboarding.stepsAria}>
        {steps.map((label, i) => {
          const n = i + 1
          const state = n < step ? 'done' : n === step ? 'current' : 'next'
          return (
            <li
              key={label}
              aria-current={state === 'current' ? 'step' : undefined}
              className="flex flex-1 items-center gap-2"
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold transition-colors',
                  state === 'done' && 'bg-success-soft text-success',
                  state === 'current' && 'bg-accent text-accent-foreground',
                  state === 'next' && 'bg-surface-muted text-muted-foreground',
                )}
              >
                {state === 'done' ? <Check className="size-4" aria-hidden /> : n}
              </span>
              <span
                className={cn(
                  'text-sm font-medium max-sm:hidden',
                  state === 'current' ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
              {n < steps.length ? <span className="h-px flex-1 bg-border" aria-hidden /> : null}
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-sm font-medium sm:hidden">
        {fmt(t.wizard.stepOf, { n: step, total: 3 })}
      </p>

      <div className="mt-6 rounded-2xl border border-border bg-surface p-5 sm:p-7">
        {step === 1 ? (
          <div className="animate-fade-up space-y-5">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight">
                {prefill.isEdit ? t.onboarding.profileTitle : t.onboarding.whoTitle}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.onboarding.whoSub}</p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">{t.onboarding.nameLabel}</span>
              {/* без autoFocus: на мобильном клавиатура прятала бы плашку и чипы */}
              <Input
                value={name}
                placeholder={t.onboarding.namePlaceholder}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div>
              <p className="mb-1.5 text-sm font-semibold">{t.onboarding.whatLabel}</p>
              <div className="flex flex-wrap gap-2">
                {SPECIALIZATION_CODES.map((code) => (
                  <Chip key={code} active={spec === code} onClick={() => setSpec(code)}>
                    {t.specializations[code]}
                  </Chip>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">
                {t.onboarding.worksAtLabel}{' '}
                <span className="font-normal text-muted-foreground">{t.onboarding.optional}</span>
              </span>
              <Input
                value={worksAt}
                placeholder={t.onboarding.worksAtPlaceholder}
                onChange={(e) => setWorksAt(e.target.value)}
              />
              <span className="mt-1.5 block text-[13px] text-muted-foreground">
                {t.onboarding.worksAtHint}
              </span>
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="animate-fade-up space-y-5">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight">
                {t.onboarding.districtsTitle}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {fmt(t.onboarding.districtsSub, { n: MAX_EXPERTISE_DISTRICTS })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {districts.map((d) => (
                <Chip
                  key={d.slug}
                  active={selected.includes(d.slug)}
                  disabled={
                    !selected.includes(d.slug) && selected.length >= MAX_EXPERTISE_DISTRICTS
                  }
                  onClick={() => toggleDistrict(d.slug)}
                >
                  {d.name}
                </Chip>
              ))}
            </div>
            <p
              className={cn(
                'text-[13px]',
                selected.length >= MAX_EXPERTISE_DISTRICTS
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {fmt(t.onboarding.selectedOf, { n: selected.length, max: MAX_EXPERTISE_DISTRICTS })}
            </p>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="animate-fade-up text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="size-7" aria-hidden />
            </span>
            <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight">
              {prefill.isEdit ? t.onboarding.savedTitle : t.onboarding.readyTitle}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
              {prefill.isEdit ? t.onboarding.savedText : t.onboarding.readyText}
            </p>
            {!prefill.telegramLinked && prefill.telegramDeepLink ? (
              <div className="mx-auto mt-5 max-w-sm rounded-xl bg-surface-muted px-4 py-4">
                <p className="flex items-center justify-center gap-1.5 text-sm font-semibold">
                  <Send className="size-4" aria-hidden />
                  {t.onboarding.tgTitle}
                </p>
                <div className="mt-3">
                  {/* soft: единственный primary экрана — CTA ниже */}
                  <TelegramLinkButton deepLink={prefill.telegramDeepLink} variant="soft" />
                </div>
              </div>
            ) : null}
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {prefill.isEdit ? (
                <>
                  <Button asChild size="lg">
                    <Link href={setup.data ? `/s/${setup.data.slug}` : '/specialists'}>
                      {t.onboarding.openProfile}
                    </Link>
                  </Button>
                  <Button asChild variant="secondary" size="lg">
                    <Link href="/new">
                      <ImagePlus aria-hidden />
                      {t.onboarding.addDeal}
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild size="lg">
                    <Link href="/new">
                      <ImagePlus aria-hidden />
                      {t.onboarding.addFirstDeal}
                    </Link>
                  </Button>
                  <Button asChild variant="secondary" size="lg">
                    <Link href={setup.data ? `/s/${setup.data.slug}` : '/specialists'}>
                      {t.onboarding.openProfile}
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {setup.isError ? (
        <p className="mt-3 text-center text-[13px] text-danger sm:text-right">
          {setup.error.message}
        </p>
      ) : null}

      {step < 3 ? (
        // действия — в зоне большого пальца: на мобильном футер прилипает к низу
        // (тот же паттерн, что в мастере кейса)
        <div className="sticky bottom-0 z-30 mt-5 max-sm:-mx-4 max-sm:border-t max-sm:border-border max-sm:bg-background/95 max-sm:px-4 max-sm:py-3 max-sm:backdrop-blur-md">
          <div className="flex items-center gap-3">
            {step > 1 ? (
              <Button variant="ghost" onClick={() => setStep(1)} className="shrink-0">
                <ArrowLeft aria-hidden />
                {t.wizard.back}
              </Button>
            ) : null}
            <div className={cn('min-w-0 flex-1 sm:flex-none', step === 1 && 'sm:ml-auto')}>
              {step === 1 ? (
                <Button size="lg" disabled={!canNext} onClick={() => setStep(2)} className="w-full">
                  {t.onboarding.nextBtn}
                  <ArrowRight aria-hidden />
                </Button>
              ) : (
                <Button size="lg" loading={setup.isPending} onClick={submit} className="w-full">
                  {prefill.isEdit ? t.onboarding.save : t.onboarding.createProfile}
                  <ArrowRight aria-hidden />
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
