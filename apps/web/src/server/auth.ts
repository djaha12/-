import 'server-only'
import { createHash, randomBytes, randomInt } from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import type { TrustTier } from '@atelier/core'
import { prisma } from '@atelier/db'

export const SESSION_COOKIE = 'atelier_session'
const SESSION_DAYS = 30

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5)
  await prisma.session.create({ data: { tokenHash: sha256(token), userId, expiresAt } })
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    path: '/',
  })
}

export async function destroySession() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } })
  }
  jar.delete(SESSION_COOKIE)
}

export interface SessionUser {
  id: string
  displayName: string | null
  phone: string | null
  role: string
  specialistSlug: string | null
  trustTier: TrustTier
  frozenAt: Date | null
}

// cache(): один запрос сессии на рендер (layout, страница, generateMetadata) —
// и один и тот же объект-ссылка, чтобы cache(getCase)(slug, viewer) дедупился
export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { specialistProfile: true } } },
  })
  if (!session || session.expiresAt < new Date() || session.user.deletedAt) return null
  return {
    id: session.user.id,
    displayName: session.user.displayName,
    phone: session.user.phone,
    role: session.user.role,
    specialistSlug: session.user.specialistProfile?.slug ?? null,
    trustTier: session.user.trustTier,
    frozenAt: session.user.frozenAt,
  }
})
