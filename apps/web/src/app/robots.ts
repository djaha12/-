import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      // /api/og/ разрешён явно: боты соцсетей уважают robots для og:image —
      // общий disallow /api/ оставил бы карточки без картинок
      allow: ['/', '/api/og/'],
      // приватные и служебные зоны — вне индекса
      disallow: ['/admin', '/messages', '/briefs', '/saved', '/api/', '/login', '/contact/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
