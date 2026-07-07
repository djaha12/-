import { PrismaClient } from '@prisma/client'

const DEFAULT_DEV_URL = 'postgresql://atelier@localhost:5433/atelier'

// fail-fast: молчаливый localhost в проде дал бы 500 на всех страницах в рантайме
// вместо явного падения на старте. В dev — дефолтная строка dev-БД. Во время
// сборки Next коллектит page data без реальной БД (NEXT_PHASE) — там не падаем.
function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (url) return url
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build'
  if (process.env.NODE_ENV === 'production' && !isBuild) {
    throw new Error('DATABASE_URL обязателен в production — задайте пул-строку Postgres.')
  }
  return DEFAULT_DEV_URL
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: resolveDatabaseUrl() } },
  })

// в dev не плодим коннекты при HMR
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export * from '@prisma/client'
