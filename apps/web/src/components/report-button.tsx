'use client'

import * as React from 'react'
import { Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

const REASONS = [
  { key: 'stolen', label: 'Украденный контент' },
  { key: 'contacts', label: 'Контакты в описании' },
  { key: 'fake', label: 'Недостоверно' },
  { key: 'spam', label: 'Спам' },
  { key: 'offensive', label: 'Оскорбительно' },
  { key: 'other', label: 'Другое' },
] as const

type ReasonKey = (typeof REASONS)[number]['key']

/** Жалоба на кейс — доступна и гостям (анонимный cookie на сервере) */
export function ReportButton({ caseSlug }: { caseSlug: string }) {
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState<ReasonKey | null>(null)
  const [comment, setComment] = React.useState('')
  const report = trpc.reports.create.useMutation()

  if (report.isSuccess) {
    return (
      <p className="py-2 text-center text-[13px] text-muted-foreground">
        Спасибо, жалоба у модераторов — обычно разбираем в течение дня.
      </p>
    )
  }

  if (!open) {
    return (
      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          className="h-11 text-muted-foreground sm:h-9"
          onClick={() => setOpen(true)}
        >
          <Flag aria-hidden />
          Пожаловаться на кейс
        </Button>
      </div>
    )
  }

  return (
    <form
      className="mx-auto max-w-xl rounded-2xl border border-border bg-surface p-5 shadow-card"
      onSubmit={(e) => {
        e.preventDefault()
        if (reason) report.mutate({ caseSlug, reason, comment: comment.trim() || undefined })
      }}
    >
      <p className="text-sm font-semibold">Что не так с этим кейсом?</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setReason(r.key)}
            aria-pressed={reason === r.key}
            className={cn(
              'h-11 rounded-full border px-4 text-sm transition-colors sm:h-9',
              reason === r.key
                ? 'border-transparent bg-accent-soft font-medium text-accent-soft-foreground'
                : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder="Пара слов для модератора (не обязательно)"
        className="mt-3 w-full resize-y rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm leading-relaxed placeholder:text-faint-foreground focus:border-border-strong focus:outline-none"
      />
      {report.isError ? (
        <p className="mt-2 text-[13px] text-danger">{report.error.message}</p>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" variant="soft" size="sm" className="h-11 sm:h-9" loading={report.isPending} disabled={!reason}>
          Отправить жалобу
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-11 sm:h-9" onClick={() => setOpen(false)}>
          Отмена
        </Button>
      </div>
    </form>
  )
}
