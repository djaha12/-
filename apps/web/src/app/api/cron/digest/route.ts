import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { runDigest } from '@/server/digest'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const sha = (s: string) => createHash('sha256').update(s).digest()

/**
 * Крон дайджеста (раз в день, 5:00 UTC ≈ 11:00 Бишкека — рабочее утро).
 * Fail-closed: без настроенного CRON_SECRET роут отвечает 401 всегда.
 * Запуск: curl -X POST -H "Authorization: Bearer $CRON_SECRET" /api/cron/digest
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('authorization') ?? ''
  if (!secret || !timingSafeEqual(sha(header), sha(`Bearer ${secret}`))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await runDigest())
}

export { handle as GET, handle as POST }
