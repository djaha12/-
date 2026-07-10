'use client'

import { useRouter } from 'next/navigation'
import { LOCALE_COOKIE, LOCALE_LABEL, LOCALES } from '@/i18n/dictionaries'
import { useI18n } from '@/i18n/client'
import { cn } from '@/lib/utils'

/** Переключатель языка в футере: cookie + refresh, без перезагрузки страницы */
export function LocaleSwitcher() {
  const router = useRouter()
  const { locale } = useI18n()

  const switchTo = (l: string) => {
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }

  return (
    <span className="flex items-center gap-1" role="group" aria-label="Язык · Тил · Language">
      {LOCALES.map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          {i > 0 ? <span aria-hidden>·</span> : null}
          <button
            type="button"
            onClick={() => switchTo(l)}
            aria-pressed={locale === l}
            className={cn(
              'cursor-pointer rounded-sm px-0.5 py-2 transition-colors',
              locale === l
                ? 'font-semibold text-foreground'
                : 'hover:text-foreground',
            )}
          >
            {LOCALE_LABEL[l]}
          </button>
        </span>
      ))}
    </span>
  )
}
