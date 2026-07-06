'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, EyeOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc'

/** Премодерация: опубликовать или отклонить кейс новичка (с причиной для автора) */
export function CaseModerationActions({ caseId }: { caseId: string }) {
  const router = useRouter()
  const [rejecting, setRejecting] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const approve = trpc.admin.approveCase.useMutation({ onSuccess: () => router.refresh() })
  const reject = trpc.admin.rejectCase.useMutation({ onSuccess: () => router.refresh() })
  const error = approve.error ?? reject.error

  if (rejecting) {
    return (
      <form
        className="w-full"
        onSubmit={(e) => {
          e.preventDefault()
          reject.mutate({ caseId, reason: reason.trim() })
        }}
      >
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          autoFocus
          placeholder="Причина для автора: что исправить, чтобы кейс прошёл"
          className="w-full resize-y rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm leading-relaxed placeholder:text-faint-foreground focus:border-border-strong focus:outline-none"
        />
        {error ? <p className="mt-1.5 text-[13px] text-danger">{error.message}</p> : null}
        <div className="mt-2 flex items-center gap-2">
          <Button
            type="submit"
            variant="soft"
            size="sm"
            className="h-11 sm:h-9"
            loading={reject.isPending}
            disabled={reason.trim().length < 5}
          >
            Отклонить с причиной
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-11 sm:h-9" onClick={() => setRejecting(false)}>
            Отмена
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="w-full">
      {error ? <p className="mb-1.5 text-[13px] text-danger">{error.message}</p> : null}
      <div className="flex items-center gap-2">
        <Button
          variant="soft"
          size="sm"
          className="h-11 sm:h-9"
          loading={approve.isPending}
          onClick={() => approve.mutate({ caseId })}
        >
          <Check aria-hidden />
          Опубликовать
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-11 text-muted-foreground sm:h-9"
          onClick={() => setRejecting(true)}
        >
          <X aria-hidden />
          Отклонить
        </Button>
      </div>
    </div>
  )
}

/** Жалоба: скрыть контент (страйк автору) или отклонить жалобу */
export function ReportActions({ reportId }: { reportId: string }) {
  const router = useRouter()
  const [armed, setArmed] = React.useState(false)
  const resolve = trpc.admin.resolveReport.useMutation({ onSuccess: () => router.refresh() })

  return (
    <div className="w-full">
      {resolve.isError ? (
        <p className="mb-1.5 text-[13px] text-danger">{resolve.error.message}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {armed ? (
          <>
            <Button
              variant="danger"
              size="sm"
              className="h-11 sm:h-9"
              loading={resolve.isPending}
              onClick={() => resolve.mutate({ reportId, action: 'hide' })}
            >
              <EyeOff aria-hidden />
              Точно скрыть (страйк автору)
            </Button>
            <Button variant="ghost" size="sm" className="h-11 sm:h-9" onClick={() => setArmed(false)}>
              Отмена
            </Button>
          </>
        ) : (
          <>
            <Button variant="soft" size="sm" className="h-11 sm:h-9" onClick={() => setArmed(true)}>
              <EyeOff aria-hidden />
              Скрыть контент
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-11 text-muted-foreground sm:h-9"
              loading={resolve.isPending && resolve.variables?.action === 'dismiss'}
              onClick={() => resolve.mutate({ reportId, action: 'dismiss' })}
            >
              Жалоба не подтвердилась
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
