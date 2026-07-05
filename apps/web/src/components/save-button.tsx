'use client'

import * as React from 'react'
import { Bookmark } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SaveButtonProps {
  /** плавающая по фото или строчная в тулбаре */
  floating?: boolean
  defaultSaved?: boolean
  className?: string
}

/** Сохранение в коллекцию — «маленький момент радости» (анимация save-pop) */
export function SaveButton({ floating = false, defaultSaved = false, className }: SaveButtonProps) {
  const [saved, setSaved] = React.useState(defaultSaved)

  return (
    <button
      type="button"
      aria-label={saved ? 'Убрать из коллекции' : 'Сохранить в коллекцию'}
      aria-pressed={saved}
      onClick={(e) => {
        e.preventDefault()
        setSaved((s) => !s)
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
