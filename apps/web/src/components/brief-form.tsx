'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { trpc } from '@/lib/trpc'
import { cn, formatBudgetRange } from '@/lib/utils'

const OBJECT_TYPES = [
  { key: 'apartment', label: 'Квартира' },
  { key: 'newBuild', label: 'Новостройка' },
  { key: 'house', label: 'Дом' },
  { key: 'commercial', label: 'Коммерция' },
  { key: 'land', label: 'Участок' },
  { key: 'other', label: 'Другое' },
] as const

type ObjectKey = (typeof OBJECT_TYPES)[number]['key']

export function BriefForm({ districts }: { districts: Array<{ slug: string; name: string }> }) {
  const router = useRouter()
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [objectType, setObjectType] = React.useState<ObjectKey>('apartment')
  const [districtName, setDistrictName] = React.useState('')
  const [budgetMin, setBudgetMin] = React.useState('')
  const [budgetMax, setBudgetMax] = React.useState('')

  const create = trpc.briefs.create.useMutation({
    onSuccess: ({ id }) => {
      router.push(`/briefs/${id}`)
      router.refresh()
    },
  })

  const min = budgetMin ? Number(budgetMin) : undefined
  const max = budgetMax ? Number(budgetMax) : undefined
  // бюджет — вилкой или никак: половинчатая вилка нечитаема в ленте
  const budgetPartial = (min == null) !== (max == null)
  const budgetInverted = min != null && max != null && min > max
  const canSubmit =
    title.trim().length >= 5 && description.trim().length >= 20 && !budgetPartial && !budgetInverted

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate({
          title: title.trim(),
          description: description.trim(),
          objectType,
          districtName: districtName || undefined,
          budgetMin: min,
          budgetMax: max,
        })
      }}
    >
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold">Что нужно сделать</span>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Продать двушку 58 м² в Аламедине-1"
          autoFocus
          className="rounded-xl"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold">Детали задачи</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Например: 4 этаж, состояние жилое, документы готовы. Хочу продать за 2–3 месяца, нужна помощь с ценой и показами."
          className="w-full resize-y rounded-xl border border-border bg-surface px-4 py-3 text-[15px] leading-relaxed placeholder:text-faint-foreground transition-colors hover:border-border-strong focus:border-border-strong focus:outline-none"
        />
        <span className="mt-1.5 block text-[13px] text-muted-foreground">
          Без телефонов и адресов — контакты появятся в чате после отклика.
        </span>
      </label>

      <fieldset>
        <legend className="mb-2 block text-sm font-semibold">Объект</legend>
        <div className="flex flex-wrap gap-2">
          {OBJECT_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setObjectType(t.key)}
              aria-pressed={objectType === t.key}
              className={cn(
                'h-10 rounded-full border px-4 text-sm transition-colors',
                objectType === t.key
                  ? 'border-transparent bg-accent-soft font-medium text-accent-soft-foreground'
                  : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold">Район</span>
        <select
          value={districtName}
          onChange={(e) => setDistrictName(e.target.value)}
          className="h-11 w-full appearance-none rounded-xl border border-border bg-surface px-4 text-[15px] transition-colors hover:border-border-strong focus:border-border-strong focus:outline-none"
        >
          <option value="">Весь Бишкек</option>
          {districts.map((d) => (
            <option key={d.slug} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
      </label>

      <div>
        <span className="mb-1.5 block text-sm font-semibold">
          Бюджет, сом <span className="font-normal text-muted-foreground">(не обязательно)</span>
        </span>
        <div className="grid grid-cols-2 gap-2.5">
          <Input
            inputMode="numeric"
            value={budgetMin ? Number(budgetMin).toLocaleString('ru-RU') : ''}
            onChange={(e) => setBudgetMin(e.target.value.replace(/\D/g, ''))}
            placeholder="от 4 200 000"
            aria-label="Бюджет от"
            className="rounded-xl"
          />
          <Input
            inputMode="numeric"
            value={budgetMax ? Number(budgetMax).toLocaleString('ru-RU') : ''}
            onChange={(e) => setBudgetMax(e.target.value.replace(/\D/g, ''))}
            placeholder="до 4 600 000"
            aria-label="Бюджет до"
            className="rounded-xl"
          />
        </div>
        {min && max && !budgetInverted ? (
          <span className="mt-1.5 block text-[13px] text-muted-foreground">
            В ленте специалистов: {formatBudgetRange(min, max).som}
          </span>
        ) : null}
        {budgetPartial ? (
          <span className="mt-1.5 block text-[13px] text-muted-foreground">
            Укажите обе границы — или оставьте пустым, обсудите в чате.
          </span>
        ) : null}
        {budgetInverted ? (
          <span className="mt-1.5 block text-[13px] text-danger">
            Нижняя граница больше верхней.
          </span>
        ) : null}
      </div>

      {create.isError ? <p className="text-[13px] text-danger">{create.error.message}</p> : null}

      <Button type="submit" size="lg" className="w-full" loading={create.isPending} disabled={!canSubmit}>
        Опубликовать бриф
      </Button>
      <p className="text-center text-[13px] text-muted-foreground">
        Бриф увидят специалисты Ателье. Это бесплатно и ни к чему не обязывает.
      </p>
    </form>
  )
}
