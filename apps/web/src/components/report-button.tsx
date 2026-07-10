'use client'

import * as React from 'react'
import { Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/client'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

const REASON_KEYS = ['stolen', 'contacts', 'fake', 'spam', 'offensive', 'other'] as const

type ReasonKey = (typeof REASON_KEYS)[number]

/** Жалоба на кейс — доступна и гостям (анонимный cookie на сервере) */
export function ReportButton({ caseSlug }: { caseSlug: string }) {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState<ReasonKey | null>(null)
  const [comment, setComment] = React.useState('')
  const report = trpc.reports.create.useMutation()

  if (report.isSuccess) {
    return (
      <p className="py-2 text-center text-[13px] text-muted-foreground">
        {t.report.thanks}
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
          {t.report.cta}
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
      <p className="text-sm font-semibold">{t.report.title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {REASON_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setReason(key)}
            aria-pressed={reason === key}
            className={cn(
              'h-11 rounded-full border px-4 text-sm transition-colors sm:h-9',
              reason === key
                ? 'border-transparent bg-accent-soft font-medium text-accent-soft-foreground'
                : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
            )}
          >
            {t.report[key]}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder={t.report.placeholder}
        className="mt-3 w-full resize-y rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm leading-relaxed placeholder:text-faint-foreground focus:border-border-strong focus:outline-none"
      />
      {report.isError ? (
        <p className="mt-2 text-[13px] text-danger">{report.error.message}</p>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" variant="soft" size="sm" className="h-11 sm:h-9" loading={report.isPending} disabled={!reason}>
          {t.report.submit}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-11 sm:h-9" onClick={() => setOpen(false)}>
          {t.report.cancel}
        </Button>
      </div>
    </form>
  )
}
