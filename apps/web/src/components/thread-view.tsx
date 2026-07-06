'use client'

import * as React from 'react'
import Link from 'next/link'
import { BadgeCheck, Check, Send, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { trpc } from '@/lib/trpc'
import { cn, formatBudgetRange } from '@/lib/utils'

/* ————— панель заказа ————— */

const STATE_META: Record<string, { label: string; tone: 'accent' | 'success' | 'neutral' }> = {
  discussion: { label: 'Условия предложены', tone: 'accent' },
  agreed: { label: 'Договорились', tone: 'accent' },
  in_progress: { label: 'В работе', tone: 'accent' },
  delivered: { label: 'Сдан — ждёт подтверждения', tone: 'accent' },
  completed: { label: 'Завершён', tone: 'success' },
  cancelled: { label: 'Отменён', tone: 'neutral' },
  disputed: { label: 'Спор', tone: 'neutral' },
}

function StarInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label}: ${n} из 5`}
            onClick={() => onChange(n)}
            className="-my-1.5 cursor-pointer p-2.5"
          >
            <Star
              className={cn(
                'size-6 transition-colors',
                n <= value ? 'fill-warning text-warning' : 'fill-border text-border',
              )}
              aria-hidden
            />
          </button>
        ))}
      </span>
    </div>
  )
}

function ReviewForm({ orderId }: { orderId: string }) {
  const utils = trpc.useUtils()
  const [scores, setScores] = React.useState({ quality: 5, timing: 5, communication: 5, budget: 5 })
  const [text, setText] = React.useState('')
  const create = trpc.reviews.create.useMutation({
    onSuccess: () => utils.orders.forThread.invalidate(),
  })

  return (
    <form
      className="mt-3 space-y-3 border-t border-border pt-3"
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate({ orderId, ...scores, text })
      }}
    >
      <p className="text-sm font-semibold">Как всё прошло? Отзыв увидят другие клиенты.</p>
      <div className="space-y-2">
        <StarInput label="Качество" value={scores.quality} onChange={(v) => setScores((s) => ({ ...s, quality: v }))} />
        <StarInput label="Сроки" value={scores.timing} onChange={(v) => setScores((s) => ({ ...s, timing: v }))} />
        <StarInput label="Общение" value={scores.communication} onChange={(v) => setScores((s) => ({ ...s, communication: v }))} />
        <StarInput label="Бюджет" value={scores.budget} onChange={(v) => setScores((s) => ({ ...s, budget: v }))} />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Что получилось хорошо? Что стоит знать будущим клиентам?"
        className="w-full resize-y rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm leading-relaxed placeholder:text-faint-foreground focus:border-border-strong focus:outline-none"
      />
      {create.isError ? <p className="text-[13px] text-danger">{create.error.message}</p> : null}
      <Button type="submit" className="w-full" loading={create.isPending} disabled={text.trim().length < 10}>
        Оставить отзыв
      </Button>
    </form>
  )
}

function ProposeOrderForm({ threadId, onDone }: { threadId: string; onDone: () => void }) {
  const utils = trpc.useUtils()
  const [title, setTitle] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const propose = trpc.orders.propose.useMutation({
    onSuccess: () => {
      utils.orders.forThread.invalidate()
      onDone()
    },
  })
  const num = amount ? Number(amount) : undefined
  const rangeMax = num ? Math.round(num * 1.15) : undefined

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        propose.mutate({
          threadId,
          title: title.trim(),
          amountMin: num,
          amountMax: rangeMax,
        })
      }}
    >
      <p className="text-sm font-semibold">Предложить заказ</p>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
          Что делаем
        </span>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Продажа двушки на Токтогула"
          className="rounded-xl"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
          Ориентир стоимости, сом (не обязательно)
        </span>
        <Input
          inputMode="numeric"
          value={amount ? Number(amount).toLocaleString('ru-RU') : ''}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
          placeholder="6 200 000"
          className="rounded-xl"
        />
        {num && rangeMax ? (
          <span className="mt-1.5 block text-[13px] text-muted-foreground">
            Зафиксируем как вилку: {formatBudgetRange(num, rangeMax).som}
          </span>
        ) : null}
      </label>
      <p className="text-xs text-muted-foreground">
        Условия зафиксируются в заказе. Оплата — напрямую между вами: Ателье не берёт комиссию.
      </p>
      {propose.isError ? <p className="text-[13px] text-danger">{propose.error.message}</p> : null}
      <Button type="submit" className="w-full" loading={propose.isPending} disabled={title.trim().length < 3}>
        Отправить условия
      </Button>
    </form>
  )
}

function OrderPanel({ threadId }: { threadId: string }) {
  const utils = trpc.useUtils()
  const { data: order, isPending } = trpc.orders.forThread.useQuery(
    { threadId },
    { refetchInterval: 8000 },
  )
  const [proposing, setProposing] = React.useState(false)
  const [linkSlug, setLinkSlug] = React.useState('')
  const transition = trpc.orders.transition.useMutation({
    onSuccess: () => utils.orders.forThread.invalidate(),
  })
  const linkCase = trpc.orders.linkCase.useMutation({
    onSuccess: () => utils.orders.forThread.invalidate(),
  })

  if (isPending) return <Skeleton className="h-14 rounded-xl" />

  const terminal = order != null && ['completed', 'cancelled'].includes(order.state)

  if (proposing) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <ProposeOrderForm threadId={threadId} onDone={() => setProposing(false)} />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border-strong px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Договорились? Зафиксируйте условия заказом — путь к отзыву и бейджу.
        </p>
        <Button variant="soft" size="sm" onClick={() => setProposing(true)} className="shrink-0">
          Предложить заказ
        </Button>
      </div>
    )
  }

  const meta = STATE_META[order.state] ?? STATE_META.discussion!
  const isClient = order.myRole === 'client'
  const go = (to: 'agreed' | 'in_progress' | 'delivered' | 'completed' | 'cancelled') =>
    transition.mutate({ orderId: order.id, to })
  const amount =
    order.amountMin && order.amountMax
      ? formatBudgetRange(order.amountMin, order.amountMax).som
      : null

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card max-sm:p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{order.title}</p>
          {/* на 390 панель компактная: цена читается в самом заказе */}
          <p className="mt-0.5 text-xs text-muted-foreground max-sm:hidden">
            {amount ? `${amount} · ` : ''}Заказ на Ателье
          </p>
        </div>
        <Badge variant={meta.tone} size="md">
          {order.state === 'completed' ? <Check aria-hidden /> : null}
          {meta.label}
        </Badge>
      </div>

      {transition.isError ? (
        <p className="mt-2 text-[13px] text-danger">{transition.error.message}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {order.state === 'discussion' && isClient ? (
          <>
            <Button onClick={() => go('agreed')} loading={transition.isPending} className="max-sm:flex-1">
              Подтвердить условия
            </Button>
            <Button variant="ghost" size="sm" onClick={() => go('cancelled')}>
              Отклонить
            </Button>
          </>
        ) : null}
        {order.state === 'discussion' && !isClient ? (
          <p className="text-[13px] text-muted-foreground">
            Ждём подтверждения клиента — условия у него на экране.
          </p>
        ) : null}
        {order.state === 'agreed' && !isClient ? (
          <Button onClick={() => go('in_progress')} loading={transition.isPending} className="max-sm:flex-1">
            Начать работу
          </Button>
        ) : null}
        {order.state === 'in_progress' && !isClient ? (
          <Button onClick={() => go('delivered')} loading={transition.isPending} className="max-sm:flex-1">
            Сдать работу
          </Button>
        ) : null}
        {order.state === 'delivered' && isClient ? (
          <Button onClick={() => go('completed')} loading={transition.isPending} className="max-sm:flex-1">
            Подтвердить приёмку
          </Button>
        ) : null}
        {order.state === 'delivered' && order.autoConfirmAt ? (
          <p className="w-full text-xs text-muted-foreground">
            <span className="max-sm:hidden">
              {isClient
                ? `Если не подтвердите до ${new Date(order.autoConfirmAt).toLocaleDateString('ru-RU')}, заказ завершится автоматически.`
                : `Клиент подтверждает приёмку — без ответа заказ завершится сам ${new Date(order.autoConfirmAt).toLocaleDateString('ru-RU')}.`}
            </span>
            {/* на 390 — коротко, чтобы sticky-панель не разрасталась */}
            <span className="sm:hidden">
              Без подтверждения завершится сам{' '}
              {new Date(order.autoConfirmAt).toLocaleDateString('ru-RU')}.
            </span>
          </p>
        ) : null}
        {['discussion', 'agreed', 'in_progress'].includes(order.state) &&
        !(order.state === 'discussion' && isClient) ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-muted-foreground"
            onClick={() => go('cancelled')}
          >
            Отменить
          </Button>
        ) : null}
      </div>

      {order.state === 'completed' && isClient && !order.hasReview ? (
        <ReviewForm orderId={order.id} />
      ) : null}
      {order.state === 'completed' && order.hasReview ? (
        <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-sm text-success">
          <Check className="size-4" aria-hidden />
          Отзыв оставлен — спасибо! Он уже в профиле специалиста.
        </p>
      ) : null}

      {order.state === 'completed' && !isClient && order.linkableCases.length > 0 ? (
        <div className="mt-3 border-t border-border pt-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <BadgeCheck className="size-4 text-success" aria-hidden />
            Подтвердите кейс этой сделкой
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Кейс получит бейдж «Подтверждено клиентом» и поднимется в ленте.
          </p>
          <div className="mt-2 flex gap-2">
            <select
              value={linkSlug}
              onChange={(e) => setLinkSlug(e.target.value)}
              className="h-11 min-w-0 flex-1 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm focus:border-border-strong focus:outline-none"
            >
              <option value="">Выберите кейс…</option>
              {order.linkableCases.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.title}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              className="h-11 shrink-0"
              disabled={!linkSlug}
              loading={linkCase.isPending}
              onClick={() => linkCase.mutate({ orderId: order.id, caseSlug: linkSlug })}
            >
              Подтвердить
            </Button>
          </div>
          {linkCase.isError ? (
            <p className="mt-2 text-[13px] text-danger">{linkCase.error.message}</p>
          ) : null}
        </div>
      ) : null}
      {linkCase.isSuccess && linkSlug ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-success">
          <BadgeCheck className="size-4" aria-hidden />
          Сделка подтверждена —{' '}
          <Link href={`/case/${linkSlug}`} className="underline underline-offset-2">
            кейс с бейджем
          </Link>
        </p>
      ) : null}

      {/* после завершения/отмены специалист может предложить новую задачу */}
      {terminal && !isClient ? (
        <div className="mt-3 border-t border-border pt-3">
          <Button variant="soft" size="sm" onClick={() => setProposing(true)}>
            Предложить новый заказ
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/* ————— тред ————— */

export function ThreadView({
  threadId,
  subject,
  otherName,
}: {
  threadId: string
  subject: string | null
  otherName: string
}) {
  const utils = trpc.useUtils()
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const [text, setText] = React.useState('')
  const { data: messages, isPending } = trpc.chat.messages.useQuery(
    { threadId },
    { refetchInterval: 4000 },
  )
  // тот же ключ, что в OrderPanel — из кеша, без второго запроса
  const { data: orderMeta } = trpc.orders.forThread.useQuery(
    { threadId },
    { refetchInterval: 8000 },
  )
  const send = trpc.chat.send.useMutation({
    onSuccess: () => {
      setText('')
      utils.chat.messages.invalidate({ threadId })
    },
  })

  const count = messages?.length ?? 0
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [count])

  const submit = () => {
    if (text.trim().length > 0 && !send.isPending) send.mutate({ threadId, text: text.trim() })
  }

  return (
    <>
      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 sm:px-6">
        <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 pt-3 pb-2 backdrop-blur-sm sm:-mx-6 sm:px-6">
          <OrderPanel threadId={threadId} />
        </div>

        {/* тема дублирует панель заказа — показываем только пока заказа нет */}
        {subject && !orderMeta ? (
          <p className="mt-3 text-center text-xs text-muted-foreground">Тема: {subject}</p>
        ) : null}

        <div className="space-y-2.5 py-4">
          {isPending ? (
            <>
              <Skeleton className="h-12 w-2/3 rounded-2xl" />
              <Skeleton className="ml-auto h-12 w-1/2 rounded-2xl" />
              <Skeleton className="h-12 w-3/5 rounded-2xl" />
            </>
          ) : (
            messages?.map((m) => (
              <div key={m.id} className={cn('flex', m.mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[78%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap',
                    m.mine
                      ? 'rounded-br-md bg-accent text-accent-foreground'
                      : 'rounded-bl-md bg-surface-muted text-foreground',
                  )}
                >
                  {m.text}
                  <span
                    className={cn(
                      'mt-1 block text-right text-[11px]',
                      m.mine ? 'text-accent-foreground/85' : 'text-faint-foreground',
                    )}
                  >
                    {new Date(m.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))
          )}
          {!isPending && count === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Напишите {otherName} — обычно отвечают быстро.
            </p>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-border bg-background/95 backdrop-blur-md">
        <form
          className="mx-auto flex w-full max-w-2xl items-end gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={1}
            placeholder="Сообщение…"
            className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-surface px-4 py-2.5 text-[15px] leading-relaxed placeholder:text-faint-foreground focus:border-border-strong focus:outline-none"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Отправить"
            loading={send.isPending}
            disabled={text.trim().length === 0}
          >
            <Send />
          </Button>
        </form>
      </div>
    </>
  )
}
