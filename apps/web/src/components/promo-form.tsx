'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { trpc } from '@/lib/trpc'

/** Активация PRO промокодом (оплата картой — Фаза 1.5) */
export function PromoForm() {
  const router = useRouter()
  const [code, setCode] = React.useState('')
  const redeem = trpc.promo.redeem.useMutation({ onSuccess: () => router.refresh() })

  if (redeem.isSuccess) {
    return (
      <p className="rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success">
        PRO активирован до {new Date(redeem.data.until).toLocaleDateString('ru-RU')} — приятной работы!
      </p>
    )
  }

  return (
    <form
      className="flex flex-col gap-2.5 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault()
        if (code.trim()) redeem.mutate({ code: code.trim() })
      }}
    >
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ПРОМОКОД"
        aria-label="Промокод"
        className="uppercase sm:max-w-60"
      />
      <Button type="submit" loading={redeem.isPending} disabled={code.trim().length < 3}>
        <Ticket aria-hidden />
        Активировать
      </Button>
      {redeem.isError ? (
        <p className="text-[13px] text-danger sm:self-center">{redeem.error.message}</p>
      ) : null}
    </form>
  )
}
