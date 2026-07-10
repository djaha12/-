import 'server-only'
import { cookies } from 'next/headers'
import { DEFAULT_LOCALE, DICTS, isLocale, LOCALE_COOKIE, type Dict, type Locale } from './dictionaries'

/** Локаль запроса: cookie → ru по умолчанию. Битые значения молча падают в ru. */
export async function getLocale(): Promise<Locale> {
  const raw = (await cookies()).get(LOCALE_COOKIE)?.value
  return isLocale(raw) ? raw : DEFAULT_LOCALE
}

/** Словарь запроса для серверных компонентов */
export async function getDict(): Promise<{ locale: Locale; t: Dict }> {
  const locale = await getLocale()
  return { locale, t: DICTS[locale] }
}
