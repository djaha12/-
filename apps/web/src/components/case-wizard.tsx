'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, BadgeCheck, Check, ImagePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CaseCard } from '@/components/case-card'
import { img, type CaseItem, type DealType } from '@/mock/data'
import { cn, formatDealPrice } from '@/lib/utils'

/* ————— простые строительные блоки формы (без библиотек — минимум полей, умные дефолты) ————— */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold">{label}</p>
      {children}
      {hint ? <p className="mt-1.5 text-[13px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

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

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: string }>
}) {
  return (
    <div className="grid grid-flow-col rounded-full border border-border bg-surface-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 cursor-pointer rounded-full px-3 text-sm font-medium transition-colors duration-150 max-sm:h-11',
            value === o.value
              ? 'bg-surface text-foreground shadow-card dark:bg-white/10'
              : 'text-muted-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ————— мастер ————— */

const STEPS = ['Фото', 'Детали', 'Публикация'] as const
const DEAL_PHOTO_POOL = ['d01', 'd02', 'g3', 'd05', 'g2', 'd06']
const PROJECT_PHOTO_POOL = ['g1', 'g2', 'g3', 'g4', 'c20', 'c14']
const DISTRICTS = ['Центр', 'Джал', 'Магистраль', 'Кок-Жар', 'Асанбай', 'Тунгуч']
const PROPERTY_TYPES = ['Вторичка', 'Новостройка', 'Дом', 'Коммерция']
const STYLES = ['Минимализм', 'Джапанди', 'Скандинавский', 'Лофт', 'Неоклассика']

interface CaseWizardProps {
  initialStep?: number
  initialKind?: 'deal' | 'project'
}

export function CaseWizard({ initialStep = 1, initialKind = 'deal' }: CaseWizardProps) {
  const [step, setStep] = React.useState(Math.min(3, Math.max(1, initialStep)))
  const [kind, setKind] = React.useState<'deal' | 'project'>(initialKind)
  const [photos, setPhotos] = React.useState<string[]>(initialStep > 1 ? DEAL_PHOTO_POOL.slice(0, 3) : [])
  const [title, setTitle] = React.useState(initialStep > 1 ? 'Двушка на Токтогула, 58 м²' : '')
  const [dealType, setDealType] = React.useState<DealType>('sale')
  const [propertyType, setPropertyType] = React.useState('Вторичка')
  const [district, setDistrict] = React.useState('Центр')
  const [price, setPrice] = React.useState(initialStep > 1 ? '4650000' : '')
  const [priceVis, setPriceVis] = React.useState<'exact' | 'range' | 'hidden'>('range')
  const [days, setDays] = React.useState(initialStep > 1 ? '18' : '')
  const [style, setStyle] = React.useState('Минимализм')
  const [areaM2, setAreaM2] = React.useState('')
  const [consent, setConsent] = React.useState(false)
  const [published, setPublished] = React.useState(false)
  const [touched, setTouched] = React.useState(initialStep > 1)

  const pool = kind === 'deal' ? DEAL_PHOTO_POOL : PROJECT_PHOTO_POOL
  const canNext = step === 1 ? photos.length > 0 : step === 2 ? title.trim().length > 2 : true
  const canPublish = kind === 'deal' ? consent : true

  // предпросмотр уважает видимость цены: «Вилка» → диапазон, «Скрыть» → без цены
  const numPrice = price && dealType !== 'buyAssist' ? Number(price) : undefined
  const roundTo10k = (v: number) => Math.round(v / 10000) * 10000
  const preview: CaseItem = {
    id: 'preview',
    slug: 'dvushka-toktogula',
    title: title || 'Название кейса',
    specialistSlug: 'nurlan-abdykadyrov',
    location: `Бишкек, ${district}`,
    styles: kind === 'project' ? [style] : [],
    areaM2: areaM2 ? Number(areaM2) : undefined,
    budgetFrom: 0,
    budgetTo: 0,
    saves: 0,
    imageId: photos[0] ?? pool[0]!,
    deal:
      kind === 'deal'
        ? {
            type: dealType,
            propertyType,
            price: priceVis === 'exact' ? numPrice : undefined,
            priceFrom:
              priceVis === 'range' && numPrice ? roundTo10k(numPrice * 0.95) : undefined,
            priceTo: priceVis === 'range' && numPrice ? roundTo10k(numPrice * 1.05) : undefined,
            daysOnMarket: days && dealType !== 'buyAssist' ? Number(days) : undefined,
            confirmed: false,
          }
        : undefined,
  }

  if (published) {
    return (
      <div className="animate-fade-up rounded-2xl border border-border bg-surface p-8 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="size-7" aria-hidden />
        </span>
        <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight">
          Кейс отправлен на проверку
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
          Обычно это занимает до 2 часов. Как только кейс опубликуется — напишем в Telegram.
        </p>
        <p className="mx-auto mt-3 max-w-sm rounded-lg bg-surface-muted px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
          Совет: сделка, проведённая через Ателье, получает бейдж
          <span className="mx-1 inline-flex translate-y-0.5 items-center gap-0.5 font-semibold text-success">
            <BadgeCheck className="size-3.5" aria-hidden />
            Подтверждено клиентом
          </span>
          и поднимается в ленте.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild variant="secondary">
            <Link href="/s/nurlan-abdykadyrov">В профиль</Link>
          </Button>
          <Button
            onClick={() => {
              setPublished(false)
              setStep(1)
              setPhotos([])
              setTitle('')
              setConsent(false)
            }}
          >
            Создать ещё
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* шаги: всегда видно, где ты и сколько осталось */}
      <ol className="flex items-center gap-2" aria-label="Шаги создания кейса">
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
          <div className="animate-fade-up">
            <h2 className="font-display text-xl font-semibold tracking-tight">Фото объекта</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Добавьте 3–20 фото. Они загружаются в фоне — продолжайте заполнять.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {photos.map((id, i) => {
                const image = img(id)
                return (
                  <span key={id} className="group relative block aspect-square overflow-hidden rounded-lg bg-surface-muted">
                    <Image
                      src={image.src}
                      alt={`Фото ${i + 1}`}
                      fill
                      sizes="150px"
                      className="object-cover"
                    />
                    {i === 0 ? (
                      <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
                        Обложка
                      </span>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`Убрать фото ${i + 1}`}
                      onClick={() => {
                        setPhotos((p) => p.filter((x) => x !== id))
                        setTouched(true)
                      }}
                      className="absolute top-1.5 right-1.5 flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </span>
                )
              })}
              {photos.length < pool.length ? (
                <button
                  type="button"
                  onClick={() => {
                    const next = pool.find((id) => !photos.includes(id))
                    if (next) setPhotos((p) => [...p, next])
                    setTouched(true)
                  }}
                  className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                >
                  <ImagePlus className="size-6" aria-hidden />
                  <span className="text-[13px] font-medium">Добавить</span>
                </button>
              ) : null}
            </div>
            {photos.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted-foreground">
                Хотя бы одно фото — и можно идти дальше. Первое станет обложкой.
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="animate-fade-up space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold tracking-tight">Детали</h2>
              <Segmented
                value={kind}
                onChange={(v) => {
                  setKind(v)
                  setTouched(true)
                }}
                options={[
                  { value: 'deal', label: 'Сделка' },
                  { value: 'project', label: 'Проект' },
                ]}
              />
            </div>

            <Field label="Название" hint="Коротко и по делу — как рассказали бы клиенту.">
              <Input
                value={title}
                placeholder={kind === 'deal' ? 'Двушка на Токтогула, 58 м²' : 'Лофт для молодой пары в Джале'}
                onChange={(e) => {
                  setTitle(e.target.value)
                  setTouched(true)
                }}
              />
            </Field>

            {kind === 'deal' ? (
              <>
                <Field label="Тип сделки">
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ['sale', 'Продажа'],
                        ['rentOut', 'Аренда'],
                        ['buyAssist', 'Подбор'],
                      ] as const
                    ).map(([v, label]) => (
                      <Chip key={v} active={dealType === v} onClick={() => { setDealType(v); setTouched(true) }}>
                        {label}
                      </Chip>
                    ))}
                  </div>
                </Field>

                <Field label="Объект">
                  <div className="flex flex-wrap gap-2">
                    {PROPERTY_TYPES.map((t) => (
                      <Chip key={t} active={propertyType === t} onClick={() => { setPropertyType(t); setTouched(true) }}>
                        {t}
                      </Chip>
                    ))}
                  </div>
                </Field>

                <Field label="Район" hint="Точный адрес не публикуется — только район.">
                  <div className="flex flex-wrap gap-2">
                    {DISTRICTS.map((d) => (
                      <Chip key={d} active={district === d} onClick={() => { setDistrict(d); setTouched(true) }}>
                        {d}
                      </Chip>
                    ))}
                  </div>
                </Field>

                {dealType !== 'buyAssist' ? (
                  <>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field
                        label={dealType === 'rentOut' ? 'Ставка, сом/мес' : 'Цена сделки, сом'}
                        hint={
                          price
                            ? formatDealPrice(Number(price), { monthly: dealType === 'rentOut' }).usd
                            : undefined
                        }
                      >
                        <Input
                          inputMode="numeric"
                          value={price ? Number(price).toLocaleString('ru-RU') : ''}
                          placeholder="4 650 000"
                          onChange={(e) => {
                            setPrice(e.target.value.replace(/\D/g, ''))
                            setTouched(true)
                          }}
                        />
                      </Field>
                      <Field
                        label="Срок на рынке, дней"
                        hint="Если сделка велась через Ателье — подставится из заказа."
                      >
                        <Input
                          inputMode="numeric"
                          value={days}
                          placeholder="18"
                          onChange={(e) => {
                            setDays(e.target.value.replace(/\D/g, ''))
                            setTouched(true)
                          }}
                        />
                      </Field>
                    </div>
                    <Field
                      label="Показывать цену"
                      hint="«Вилка» публикует диапазон — точная цена не раскрывается никогда."
                    >
                      <Segmented
                        value={priceVis}
                        onChange={(v) => {
                          setPriceVis(v)
                          setTouched(true)
                        }}
                        options={[
                          { value: 'exact', label: 'Точная' },
                          { value: 'range', label: 'Вилка' },
                          { value: 'hidden', label: 'Скрыть' },
                        ]}
                      />
                    </Field>
                  </>
                ) : (
                  <p className="rounded-lg bg-surface-muted px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
                    Для подбора цена и срок не публикуются — кейс расскажет о задаче и результате.
                  </p>
                )}
              </>
            ) : (
              <>
                <Field label="Стиль">
                  <div className="flex flex-wrap gap-2">
                    {STYLES.map((st) => (
                      <Chip key={st} active={style === st} onClick={() => { setStyle(st); setTouched(true) }}>
                        {st}
                      </Chip>
                    ))}
                  </div>
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Площадь, м²">
                    <Input
                      inputMode="numeric"
                      value={areaM2}
                      placeholder="72"
                      onChange={(e) => {
                        setAreaM2(e.target.value.replace(/\D/g, ''))
                        setTouched(true)
                      }}
                    />
                  </Field>
                  <Field label="Район">
                    <div className="flex flex-wrap gap-2">
                      {DISTRICTS.slice(0, 3).map((d) => (
                        <Chip key={d} active={district === d} onClick={() => { setDistrict(d); setTouched(true) }}>
                          {d}
                        </Chip>
                      ))}
                    </div>
                  </Field>
                </div>
              </>
            )}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="animate-fade-up">
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Так кейс увидят в ленте
            </h2>
            <div className="pointer-events-none mx-auto mt-4 max-w-[300px]" aria-hidden>
              <CaseCard item={preview} />
            </div>

            {kind === 'deal' ? (
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface-muted/50 p-4">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 size-5 shrink-0 cursor-pointer accent-(--accent)"
                />
                <span className="text-sm leading-relaxed">
                  Клиент не против публикации: фото и факты сделки согласованы.
                  <span className="block text-[13px] text-muted-foreground">
                    Обязательно для кейсов-сделок — это защищает и вас, и клиента.
                  </span>
                </span>
              </label>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* действия — в зоне большого пальца: на мобильном футер прилипает к низу */}
      <div className="sticky bottom-0 z-30 mt-5 max-sm:-mx-4 max-sm:border-t max-sm:border-border max-sm:bg-background/95 max-sm:px-4 max-sm:py-3 max-sm:backdrop-blur-md">
        {step === 3 && kind === 'deal' && !consent ? (
          <p className="mb-2 text-center text-[13px] text-muted-foreground sm:text-right">
            Отметьте согласие клиента — и можно публиковать.
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          {step > 1 ? (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} className="shrink-0">
              <ArrowLeft aria-hidden />
              Назад
            </Button>
          ) : null}
          {touched ? (
            <span className="ml-auto flex items-center gap-1 text-[13px] whitespace-nowrap text-muted-foreground max-sm:hidden">
              <Check className="size-3.5 shrink-0 text-success" aria-hidden />
              Черновик сохранён
            </span>
          ) : null}
          <div className={cn('min-w-0 sm:ml-3', step === 1 ? 'flex-1 sm:flex-none sm:ml-auto' : 'flex-1 sm:flex-none')}>
            {step < 3 ? (
              <Button
                size="lg"
                disabled={!canNext}
                onClick={() => setStep((s) => s + 1)}
                className="w-full"
              >
                Далее
                <ArrowRight aria-hidden />
              </Button>
            ) : (
              <Button
                size="lg"
                disabled={!canPublish}
                onClick={() => setPublished(true)}
                className="w-full"
              >
                Опубликовать
              </Button>
            )}
          </div>
        </div>
        {touched ? (
          <p className="mt-1.5 flex items-center justify-center gap-1 text-xs text-muted-foreground sm:hidden">
            <Check className="size-3 shrink-0 text-success" aria-hidden />
            Черновик сохранён
          </p>
        ) : null}
      </div>
    </div>
  )
}
