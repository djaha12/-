import { PrismaClient } from '@prisma/client'

const DEFAULT_DEV_URL = 'postgresql://atelier@localhost:5433/atelier'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL ?? DEFAULT_DEV_URL } },
  })

// в dev не плодим коннекты при HMR
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export * from '@prisma/client'
