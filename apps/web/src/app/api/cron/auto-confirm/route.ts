import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { runAutoConfirm } from '@/server/auto-confirm'

export const dynamic = 'force-dynamic'
// батч + транзакции + отложенная доставка в Telegram; запас под Fluid Compute
export const maxDuration = 300

const sha = (s: string) => createHash('sha256').update(s).digest()

/**
 * Крон авто-подтверждения (раз в час достаточно: точность дедлайна — дни).
 * Fail-closed: без настроенного CRON_SECRET роут отвечает 401 всегда.
 * Запуск: curl -X POST -H "Authorization: Bearer $CRON_SECRET" /api/cron/auto-confirm
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET
  const header = req.headers.get('authorization') ?? ''
  // сравнение хэшей — константное по времени (как timingSafeEqual в OTP)
  if (!secret || !timingSafeEqual(sha(header), sha(`Bearer ${secret}`))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await runAutoConfirm())
}

// GET — для хостинг-кронов (Vercel Cron шлёт GET), POST — для ручного вызова
export { handle as GET, handle as POST }
