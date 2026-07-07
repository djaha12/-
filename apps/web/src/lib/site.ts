/** Абсолютный адрес сайта: OG, canonical, sitemap, JSON-LD. */
const raw = process.env.NEXT_PUBLIC_SITE_URL
if (!raw && process.env.NODE_ENV === 'production') {
  // fail-loud: молчаливый localhost в canonical/OG/sitemap хуже громкой ошибки
  // (не throw — прод-сборкой пользуются и локальные смоуки/скриншоты)
  console.error(
    '[site] NEXT_PUBLIC_SITE_URL не задан — canonical, OG и sitemap указывают на 127.0.0.1. ' +
      'Задайте переменную окружения перед деплоем.',
  )
}
export const SITE_URL = (raw ?? 'http://127.0.0.1:3000').replace(/\/$/, '')
export const SITE_NAME = 'Ателье'
export const SITE_TAGLINE = 'Портфолио и честная репутация специалистов недвижимости Кыргызстана'
