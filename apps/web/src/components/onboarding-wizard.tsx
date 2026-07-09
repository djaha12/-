'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, ImagePlus, Send } from 'lucide-react'
import { MAX_EXPERTISE_DISTRICTS } from '@atelier/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TelegramLinkButton } from '@/components/telegram-link'
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

const SPECIALIZATIONS: Array<{ value: string; label: string }> = [
  { value: 'REALTOR', label: 'Риелтор' },
  { value: 'INTERIOR_DESIGNER', label: 'Дизайнер интерьера' },
  { value: 'ARCHITECT', label: 'Архитектор' },
  { value: 'DECORATOR_STAGER', label: 'Декоратор-стейджер' },
  { value: 'VISUALIZER_3D', label: '3D-визуализатор' },
  { value: 'PHOTO_VIDEO', label: 'Фотограф недвижимости' },
  { value: 'LANDSCAPE_DESIGNER', label: 'Ландшафтный дизайнер' },
]

const STEPS = ['О вас', 'Районы', 'Готово'] as const

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium transition-colors duration-150',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
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
  const router = useRouter()
  const [step, setStep] = React.useState(1)
  const [name, setName] = React.useState(prefill.displayName)
  const [spec, setSpec] = React.useState<string>(prefill.specialization ?? 'REALTOR')
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
      specialization: spec as never,
      worksAt: worksAt.trim() || undefined,
      districtSlugs: selected,
    })

  return (
    <div>
      <ol className="flex items-center gap-2" aria-label="Шаги настройки профиля">
        {STEPS.map((label, i) => {
          const n = i + 1
          const state = n < step ? 'done' : n === step ? 'current' : 'next'
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
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
              {n < STEPS.length ? <span className="h-px flex-1 bg-border" aria-hidden /> : null}
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-sm font-medium sm:hidden">Шаг {step} из 3</p>

      <div className="mt-6 rounded-2xl border border-border bg-surface p-5 sm:p-7">
        {step === 1 ? (
          <div className="animate-fade-up space-y-5">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight">
                {prefill.isEdit ? 'Профиль' : 'Кто вы'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Так вас увидят клиенты в каталоге и на странице профиля.
              </p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Имя и фамилия</span>
              <Input
                value={name}
                autoFocus
                placeholder="Айгерим Токтогулова"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div>
              <p className="mb-1.5 text-sm font-semibold">Чем занимаетесь</p>
              <div className="flex flex-wrap gap-2">
                {SPECIALIZATIONS.map((s) => (
                  <Chip key={s.value} active={spec === s.value} onClick={() => setSpec(s.value)}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">
                Работаете в агентстве или студии?{' '}
                <span className="font-normal text-muted-foreground">Необязательно</span>
              </span>
              <Input
                value={worksAt}
                placeholder="Например: Ак-Үй"
                onChange={(e) => setWorksAt(e.target.value)}
              />
              <span className="mt-1.5 block text-[13px] text-muted-foreground">
                Покажем меткой «работает в …» — репутация при этом остаётся вашей.
              </span>
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="animate-fade-up space-y-5">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight">
                Районы, где вы работаете
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                До {MAX_EXPERTISE_DISTRICTS} районов Бишкека. Фокус вызывает больше доверия, чем
                «работаю везде», — по районам клиенты фильтруют каталог.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {districts.map((d) => (
                <Chip
                  key={d.slug}
                  active={selected.includes(d.slug)}
                  onClick={() => toggleDistrict(d.slug)}
                >
                  {d.name}
                </Chip>
              ))}
            </div>
            <p className="text-[13px] text-muted-foreground">
              Выбрано: {selected.length} из {MAX_EXPERTISE_DISTRICTS}. Можно изменить в любой момент.
            </p>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="animate-fade-up text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="size-7" aria-hidden />
            </span>
            <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight">
              Профиль готов
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
              Осталось наполнить его работой: первая опубликованная сделка — это ваша визитка
              и вход в каталог.
            </p>
            {!prefill.telegramLinked && prefill.telegramDeepLink ? (
              <div className="mx-auto mt-5 max-w-sm rounded-xl bg-surface-muted px-4 py-4">
                <p className="flex items-center justify-center gap-1.5 text-sm font-semibold">
                  <Send className="size-4" aria-hidden />
                  Заявки — мгновенно в Telegram
                </p>
                <div className="mt-3">
                  <TelegramLinkButton deepLink={prefill.telegramDeepLink} />
                </div>
              </div>
            ) : null}
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/new">
                  <ImagePlus aria-hidden />
                  Добавить первую сделку
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href={setup.data ? `/s/${setup.data.slug}` : '/specialists'}>
                  Открыть профиль
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {step < 3 ? (
        <div className="mt-5 flex items-center justify-between gap-3">
          {step > 1 ? (
            <Button variant="ghost" size="lg" onClick={() => setStep(1)}>
              <ArrowLeft aria-hidden />
              Назад
            </Button>
          ) : (
            <span />
          )}
          {step === 1 ? (
            <Button size="lg" disabled={!canNext} onClick={() => setStep(2)}>
              Дальше
              <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button size="lg" loading={setup.isPending} onClick={submit}>
              {prefill.isEdit ? 'Сохранить' : 'Создать профиль'}
              <ArrowRight aria-hidden />
            </Button>
          )}
        </div>
      ) : null}
      {setup.isError ? (
        <p className="mt-3 text-center text-[13px] text-danger">{setup.error.message}</p>
      ) : null}
    </div>
  )
}
