'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc'

const REALTOR_PLACEHOLDER =
  'Например: продаю двушку 58 м² в центре, хочу понять реальную цену и сроки. Когда сможете посмотреть квартиру?'
const DESIGN_PLACEHOLDER =
  'Например: двушка 65 м² в Джале, нужен дизайн-проект под ключ к осени. Бюджет обсуждаем.'

export function ContactForm({
  specialistSlug,
  caseSlug,
  isRealtor,
}: {
  specialistSlug: string
  caseSlug?: string
  isRealtor: boolean
}) {
  const router = useRouter()
  const [text, setText] = React.useState('')
  const create = trpc.leads.create.useMutation({
    onSuccess: ({ threadId }) => {
      router.push(`/messages/${threadId}`)
      router.refresh()
    },
  })

  return (
    <form
      className="mt-5"
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate({ specialistSlug, caseSlug, text })
      }}
    >
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold">Опишите задачу</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          autoFocus
          placeholder={isRealtor ? REALTOR_PLACEHOLDER : DESIGN_PLACEHOLDER}
          className="w-full resize-y rounded-xl border border-border bg-surface px-4 py-3 text-[15px] leading-relaxed placeholder:text-faint-foreground transition-colors hover:border-border-strong focus:border-border-strong focus:outline-none focus-visible:outline-2 focus-visible:outline-ring"
        />
      </label>
      <p className="mt-1.5 text-[13px] text-muted-foreground">
        Чем конкретнее задача, тем быстрее и точнее ответ.
      </p>
      {create.isError ? (
        <p className="mt-2 text-[13px] text-danger">{create.error.message}</p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        className="mt-4 w-full"
        loading={create.isPending}
        disabled={text.trim().length < 10}
      >
        <Send aria-hidden />
        Отправить заявку
      </Button>
    </form>
  )
}
