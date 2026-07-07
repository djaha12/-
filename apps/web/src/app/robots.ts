import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // приватные и служебные зоны — вне индекса
      disallow: ['/admin', '/messages', '/briefs', '/saved', '/api/', '/login', '/contact/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
