/** Абсолютный адрес сайта: OG, canonical, sitemap, JSON-LD. Только серверные модули. */

// SITE_URL — рантайм-переменная (меняется без пересборки, в отличие от NEXT_PUBLIC_*,
// который инлайнится на билде). Порядок: явный SITE_URL → back-compat
// NEXT_PUBLIC_SITE_URL → домен Vercel-проекта.
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
const raw =
  process.env.SITE_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  (vercelUrl ? `https://${vercelUrl}` : undefined)

if (!raw && process.env.NODE_ENV === 'production') {
  // fail-loud: молчаливый localhost в canonical/OG/sitemap хуже громкой ошибки
  // (не throw — прод-сборкой пользуются и локальные смоуки/скриншоты)
  console.error(
    '[site] SITE_URL не задан — canonical, OG и sitemap указывают на 127.0.0.1. ' +
      'Задайте переменную окружения перед деплоем.',
  )
}
export const SITE_URL = (raw ?? 'http://127.0.0.1:3000').replace(/\/$/, '')
export const SITE_NAME = 'Ателье'
export const SITE_TAGLINE = 'Портфолио и честная репутация специалистов недвижимости Кыргызстана'
