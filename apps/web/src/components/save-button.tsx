'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Bookmark } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

interface SaveButtonProps {
  /** slug кейса; без него кнопка декоративная (превью мастера) */
  caseSlug?: string
  /** плавающая по фото или строчная в тулбаре */
  floating?: boolean
  defaultSaved?: boolean
  className?: string
}

/** Сохранение в коллекцию — «маленький момент радости» (анимация save-pop).
 *  Гостя ведём на вход в момент ценности. */
export function SaveButton({
  caseSlug,
  floating = false,
  defaultSaved = false,
  className,
}: SaveButtonProps) {
  const router = useRouter()
  const [saved, setSaved] = React.useState(defaultSaved)
  const toggle = trpc.saves.toggle.useMutation({
    onError: (e) => {
      setSaved((s) => !s) // откат оптимизма
      if (e.data?.code === 'UNAUTHORIZED') router.push('/login')
    },
  })

  return (
    <button
      type="button"
      aria-label={saved ? 'Убрать из коллекции' : 'Сохранить в коллекцию'}
      aria-pressed={saved}
      onClick={(e) => {
        e.preventDefault()
        setSaved((s) => !s)
        if (caseSlug) toggle.mutate({ caseSlug })
      }}
      className={cn(
        'inline-flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 ease-(--ease-soft)',
        floating
          ? // на тач-устройствах кнопка видна всегда — тихий тёмный скрим, не конкурирует с фото
            'bg-black/35 text-white backdrop-blur-sm hover:bg-black/50 md:bg-background/90 md:text-foreground md:shadow-card md:hover:bg-background'
          : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
        saved && 'text-accent hover:text-accent',
        className,
      )}
    >
      <Bookmark
        className={cn('size-5 transition-transform', saved && 'animate-save-pop fill-current')}
        aria-hidden
      />
    </button>
  )
}
