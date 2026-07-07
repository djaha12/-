'use client'

import * as React from 'react'
import { Check, Copy, ImageDown, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Шеринг: системный share на мобильном, копирование ссылки, у кейсов —
 * скачивание вертикальной визитки для сторис (/api/og/story) — маркетинг
 * специалиста в один тап.
 */
export function ShareButton({
  path,
  title,
  storySlug,
  label = 'Поделиться кейсом',
}: {
  /** путь страницы, например /case/slug или /s/slug */
  path: string
  title: string
  /** slug кейса для визитки; без него пункт скачивания не показывается */
  storySlug?: string
  label?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const url = () => `${window.location.origin}${path}`

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: url() })
        return
      } catch {
        /* пользователь закрыл системный диалог — покажем меню */
      }
    }
    setOpen((v) => !v)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url())
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
        setOpen(false)
      }, 1200)
    } catch {
      window.prompt('Скопируйте ссылку:', url())
    }
  }

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" size="icon" aria-label={label} onClick={share}>
        <Share2 />
      </Button>
      {open ? (
        <div className="absolute top-full right-0 z-30 mt-2 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-float">
          <button
            type="button"
            onClick={copy}
            className="flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-sm transition-colors hover:bg-surface-muted"
          >
            {copied ? (
              <Check className="size-4 text-success" aria-hidden />
            ) : (
              <Copy className="size-4 text-muted-foreground" aria-hidden />
            )}
            {copied ? 'Скопировано' : 'Скопировать ссылку'}
          </button>
          {storySlug ? (
            <a
              href={`/api/og/story/${storySlug}?download=1`}
              download
              onClick={() => setOpen(false)}
              className="flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-sm transition-colors hover:bg-surface-muted"
            >
              <ImageDown className="size-4 text-muted-foreground" aria-hidden />
              Визитка для сторис
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
