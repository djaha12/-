'use client'

import * as React from 'react'
import { DEFAULT_LOCALE, DICTS, type Dict, type Locale } from './dictionaries'

/**
 * Клиентский доступ к локали: словарь не сериализуем через пропсы провайдера,
 * а берём по ключу локали из бандла (DICTS и так в клиентском чанке словарей).
 */
const I18nContext = React.createContext<{ locale: Locale; t: Dict }>({
  locale: DEFAULT_LOCALE,
  t: DICTS[DEFAULT_LOCALE],
})

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ locale, t: DICTS[locale] }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return React.useContext(I18nContext)
}
