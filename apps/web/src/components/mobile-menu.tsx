'use client'

import * as React from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/client'

/**
 * Мобильная навигация (< lg): десктопное меню скрыто, а гамбургер до этого был
 * мёртвым. Здесь — рабочее выпадающее меню с теми же разделами + CTA специалиста.
 * Закрытие: клик вне, Escape, переход по ссылке. Паттерн клика-вне — как в share.
 */
export function MobileMenu({ showSpecialistCta }: { showSpecialistCta: boolean }) {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const items = [
    { href: '/', label: t.header.projects },
    { href: '/specialists', label: t.header.specialists },
    { href: '/briefs', label: t.header.briefs },
  ]

  return (
    <div className="relative lg:hidden" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t.header.menu}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X /> : <Menu />}
      </Button>
      {open ? (
        <div
          role="menu"
          className="animate-fade-up absolute top-full right-0 z-50 mt-2 w-56 rounded-xl border border-border bg-surface p-1.5 shadow-float"
        >
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex h-11 w-full items-center rounded-lg px-3 text-sm font-medium transition-colors hover:bg-surface-muted"
            >
              {it.label}
            </Link>
          ))}
          {showSpecialistCta ? (
            <>
              <span className="my-1 block h-px bg-border" aria-hidden />
              <Link
                href="/onboarding"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex h-11 w-full items-center rounded-lg bg-accent-soft px-3 text-sm font-semibold text-accent-soft-foreground transition-colors hover:bg-accent-soft/80"
              >
                {t.header.imSpecialist}
              </Link>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
