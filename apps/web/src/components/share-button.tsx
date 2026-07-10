'use client'

import * as React from 'react'
import { Check, Copy, ImageDown, Share2 } from 'lucide-react'
import type { ShareMethod, ShareSurface } from '@atelier/core'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/client'
import { REF_PARAM } from '@/lib/attribution'
import { trpc } from '@/lib/trpc'

/**
 * Шеринг: системный share на мобильном, копирование ссылки, у кейсов —
 * скачивание вертикальной визитки для сторис (/api/og/story) — маркетинг
 * специалиста в один тап. Расшаренная ссылка помечается ?ref=share, а сам факт
 * шеринга шлётся в аналитику (share-rate петли §7.1 GTM-плана).
 */
export function ShareButton({
  path,
  title,
  surface,
  storySlug,
  label,
}: {
  /** путь страницы, например /case/slug или /s/slug */
  path: string
  title: string
  /** поверхность шеринга — для атрибуции события */
  surface: ShareSurface
  /** slug кейса для визитки; без него пункт скачивания не показывается */
  storySlug?: string
  label?: string
}) {
  const { t } = useI18n()
  const ariaLabel = label ?? t.share.shareCase
  const [open, setOpen] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const track = trpc.analytics.share.useMutation()

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // расшаренная ссылка несёт метку источника — так вход по ней атрибутируется
  const url = () => {
    const u = new URL(path, window.location.origin)
    u.searchParams.set(REF_PARAM, 'share')
    return u.toString()
  }

  // fire-and-forget: аналитика не должна ломать или тормозить шеринг
  const logShare = (method: ShareMethod) => {
    track.mutate({ surface, method, slug: storySlug ?? path })
  }

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: url() })
        logShare('system')
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
      logShare('copy')
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
        setOpen(false)
      }, 1200)
    } catch {
      window.prompt(t.share.copyPrompt, url())
    }
  }

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" size="icon" aria-label={ariaLabel} onClick={share}>
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
            {copied ? t.share.copied : t.share.copyLink}
          </button>
          {storySlug ? (
            <a
              href={`/api/og/story/${storySlug}?download=1`}
              download
              onClick={() => {
                logShare('story')
                setOpen(false)
              }}
              className="flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-sm transition-colors hover:bg-surface-muted"
            >
              <ImageDown className="size-4 text-muted-foreground" aria-hidden />
              {t.share.storyCard}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
