import type { MetadataRoute } from 'next'
import { prisma } from '@atelier/db'
import { SITE_URL } from '@/lib/site'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cases, profiles] = await Promise.all([
    prisma.case.findMany({
      where: { status: 'PUBLISHED', hiddenAt: null, deletedAt: null },
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 5000,
    }),
    prisma.specialistProfile.findMany({
      where: { deletedAt: null },
      select: { slug: true, updatedAt: true },
      take: 5000,
    }),
  ])

  return [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/specialists`, changeFrequency: 'daily', priority: 0.9 },
    ...profiles.map((p) => ({
      url: `${SITE_URL}/s/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...cases.map((c) => ({
      url: `${SITE_URL}/case/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ]
}
