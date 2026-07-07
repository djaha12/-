import 'server-only'
import type { Plan } from '@atelier/core'
import { prisma } from '@atelier/db'

/**
 * Тариф пользователя (M6). Free — по умолчанию, без записи в Entitlement;
 * PRO — активный entitlement с планом PRO и не истёкшим сроком.
 * Лимиты — предикат публикации (grandfathering при даунгрейде — по схеме Plan).
 */
export async function getUserPlan(userId: string): Promise<Plan> {
  const active = await prisma.entitlement.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      plan: { code: 'PRO' },
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
    },
    select: { id: true },
  })
  return active ? 'PRO' : 'FREE'
}

/** До какой даты действует PRO (null = нет PRO; undefined-безсрочных у промо не бывает) */
export async function getProUntil(userId: string): Promise<Date | null> {
  const active = await prisma.entitlement.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      plan: { code: 'PRO' },
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
    },
    orderBy: { expiresAt: 'desc' },
    select: { expiresAt: true },
  })
  return active?.expiresAt ?? null
}

/** userIds с активным PRO — для приоритета в каталоге (один запрос на список) */
export async function getProUserIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const rows = await prisma.entitlement.findMany({
    where: {
      userId: { in: userIds },
      status: 'ACTIVE',
      plan: { code: 'PRO' },
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
    },
    select: { userId: true },
  })
  return new Set(rows.map((r) => r.userId))
}
