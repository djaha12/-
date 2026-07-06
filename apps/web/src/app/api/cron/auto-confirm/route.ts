import { NextResponse } from 'next/server'
import { runAutoConfirm } from '@/server/auto-confirm'

export const dynamic = 'force-dynamic'

/**
 * Крон авто-подтверждения (раз в час достаточно: точность дедлайна — дни).
 * Fail-closed: без настроенного CRON_SECRET роут отвечает 401 всегда.
 * Запуск: curl -X POST -H "Authorization: Bearer $CRON_SECRET" /api/cron/auto-confirm
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await runAutoConfirm())
}

// GET — для хостинг-кронов (Vercel Cron шлёт GET), POST — для ручного вызова
export { handle as GET, handle as POST }
