'use client'

import * as React from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Check, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'
import type { MockImage } from '@/mock/data'

/** Отклик специалиста: сообщение + до 3 кейсов-аргументов + оценка стоимости */
export function BriefRespondForm({
  briefId,
  myCases,
  quota,
}: {
  briefId: string
  myCases: Array<{ slug: string; title: string; image: MockImage }>
  quota: { used: number; limit: number }
}) {
  const router = useRouter()
  const [message, setMessage] = React.useState('')
  const [estimate, setEstimate] = React.useState('')
  const [selected, setSelected] = React.useState<string[]>([])
  const respond = trpc.briefs.respond.useMutation({
    onSuccess: () => router.refresh(),
  })

  const toggleCase = (slug: string) =>
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : prev.length < 3 ? [...prev, slug] : prev,
    )
  const left = quota.limit - quota.used

  return (
    <form
      className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6"
      onSubmit={(e) => {
        e.preventDefault()
        respond.mutate({
          briefId,
          message: message.trim(),
          priceEstimate: estimate ? Number(estimate) : undefined,
          caseSlugs: selected,
        })
      }}
    >
      <p className="font-display text-lg font-semibold">Откликнуться</p>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-semibold">Как решите задачу</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="Например: продал 3 похожие квартиры в этом районе за последние полгода. Начну с оценки по свежим сделкам и подготовки к показам."
          className="w-full resize-y rounded-xl border border-border bg-surface px-4 py-3 text-[15px] leading-relaxed placeholder:text-faint-foreground transition-colors hover:border-border-strong focus:border-border-strong focus:outline-none"
        />
      </label>

      {myCases.length > 0 ? (
        <fieldset className="mt-4">
          <legend className="mb-2 block text-sm font-semibold">
            Кейсы-аргументы{' '}
            <span className="font-normal text-muted-foreground">(до 3, главный довод для клиента)</span>
          </legend>
          <div className="flex flex-wrap gap-2.5">
            {myCases.map((c) => {
              const active = selected.includes(c.slug)
              return (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => toggleCase(c.slug)}
                  aria-pressed={active}
                  title={c.title}
                  className={cn(
                    'relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border-2 transition-all',
                    active ? 'border-accent' : 'border-transparent opacity-80 hover:opacity-100',
                  )}
                >
                  {c.image.src ? (
                    <Image
                      src={c.image.src}
                      alt={c.title}
                      fill
                      sizes="112px"
                      className="object-cover"
                      {...(c.image.blurDataURL
                        ? { placeholder: 'blur' as const, blurDataURL: c.image.blurDataURL }
                        : {})}
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center bg-surface-muted px-2 text-center text-[11px] leading-tight text-muted-foreground">
                      {c.title}
                    </span>
                  )}
                  {active ? (
                    <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      <Check className="size-3.5" aria-hidden />
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-semibold">
          Предварительная оценка, сом{' '}
          <span className="font-normal text-muted-foreground">(не обязательно)</span>
        </span>
        <Input
          inputMode="numeric"
          value={estimate ? Number(estimate).toLocaleString('ru-RU') : ''}
          onChange={(e) => setEstimate(e.target.value.replace(/\D/g, ''))}
          placeholder="4 500 000"
          className="max-w-56 rounded-xl"
        />
      </label>

      {respond.isError ? (
        <p className="mt-3 text-[13px] text-danger">{respond.error.message}</p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="mt-5 w-full"
        loading={respond.isPending}
        disabled={message.trim().length < 10}
      >
        Отправить отклик
      </Button>
      <p className="mt-2 text-center text-[13px] text-muted-foreground">
        {left > 0
          ? `Осталось ${left} из ${quota.limit} откликов в этом месяце (Free).`
          : 'Лимит откликов на этот месяц исчерпан.'}
      </p>
    </form>
  )
}

/** Клиент открывает чат по отклику (идемпотентно — повторный клик просто ведёт в тред) */
export function OpenChatButton({ responseId, accepted }: { responseId: string; accepted: boolean }) {
  const router = useRouter()
  const accept = trpc.briefs.accept.useMutation({
    onSuccess: ({ threadId }) => {
      router.push(`/messages/${threadId}`)
      router.refresh()
    },
  })
  return (
    <div>
      <Button
        variant={accepted ? 'soft' : 'primary'}
        size="sm"
        className="h-10"
        loading={accept.isPending}
        onClick={() => accept.mutate({ responseId })}
      >
        <MessageCircle aria-hidden />
        {accepted ? 'Открыть чат' : 'Обсудить в чате'}
      </Button>
      {accept.isError ? (
        <p className="mt-1.5 text-[13px] text-danger">{accept.error.message}</p>
      ) : null}
    </div>
  )
}

/** Закрытие брифа — двухшаговое подтверждение без модалки */
export function CloseBriefButton({ briefId }: { briefId: string }) {
  const router = useRouter()
  const [arm, setArm] = React.useState(false)
  const close = trpc.briefs.close.useMutation({
    onSuccess: () => router.refresh(),
  })
  if (!arm) {
    return (
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setArm(true)}>
        Закрыть бриф
      </Button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Button variant="soft" size="sm" loading={close.isPending} onClick={() => close.mutate({ briefId })}>
        Точно закрыть
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setArm(false)}>
        Отмена
      </Button>
    </span>
  )
}
