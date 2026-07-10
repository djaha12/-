'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { LOCALE_COOKIE, LOCALE_LABEL, LOCALES, type Locale } from '@/i18n/dictionaries'
import { useI18n } from '@/i18n/client'
import { cn } from '@/lib/utils'

/** Переключатель языка в футере: cookie + refresh, без перезагрузки страницы */
export function LocaleSwitcher() {
  const router = useRouter()
  const { locale } = useI18n()
  // на медленной сети refresh занимает секунды — показываем, что переключение идёт
  const [isPending, startTransition] = React.useTransition()

  const switchTo = (l: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`
    startTransition(() => router.refresh())
  }

  return (
    <span
      role="group"
      aria-label="Язык · Тил · Language"
      aria-busy={isPending || undefined}
      className={cn(
        'flex items-center gap-1 transition-opacity',
        isPending && 'pointer-events-none opacity-50',
      )}
    >
      {LOCALES.map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          {i > 0 ? <span aria-hidden>·</span> : null}
          {/* хит-зона 44px без роста ряда: py-3.5 компенсируется -my-2 */}
          <button
            type="button"
            onClick={() => switchTo(l)}
            aria-pressed={locale === l}
            className={cn(
              '-my-2 cursor-pointer rounded-sm px-1 py-3.5 transition-colors',
              locale === l ? 'font-semibold text-foreground' : 'hover:text-foreground',
            )}
          >
            {LOCALE_LABEL[l]}
          </button>
        </span>
      ))}
    </span>
  )
}
