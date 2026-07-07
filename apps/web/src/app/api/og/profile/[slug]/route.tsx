import { ImageResponse } from 'next/og'
import { getSpecialist } from '@/server/data'
import { loadOgFonts, OG } from '@/server/og/render'
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site'
import { plural } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getSpecialist(slug)
  if (!data) return new Response('Not found', { status: 404 })
  const s = data.specialist
  const fonts = await loadOgFonts()
  const initials = s.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')

  const facts: string[] = []
  if (s.reviewsCount > 0)
    facts.push(
      `Рейтинг ${s.rating.toFixed(1)} · ${s.reviewsCount} ${plural(s.reviewsCount, 'отзыв', 'отзыва', 'отзывов')}`,
    )
  if (s.dealStats?.confirmed)
    facts.push(
      `${s.dealStats.confirmed} ${plural(s.dealStats.confirmed, 'сделка подтверждена', 'сделки подтверждены', 'сделок подтверждено')} клиентами`,
    )
  if (s.dealStats?.medianDaysOnMarket)
    facts.push(`Медиана продажи — ${s.dealStats.medianDaysOnMarket} дн.`)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: OG.paper,
          fontFamily: 'Sans',
          padding: '64px 72px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 160,
              height: 160,
              borderRadius: 999,
              backgroundColor: OG.accentSoft,
              color: OG.accent,
              fontSize: 64,
              fontWeight: 700,
              fontFamily: 'Serif',
            }}
          >
            {initials}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontFamily: 'Serif', fontSize: 64, fontWeight: 700, color: OG.ink }}>
              {s.name}
              
            </div>
            <div style={{ display: 'flex', marginTop: 8, fontSize: 32, color: OG.muted }}>
              {s.profession} · {s.city}
              {s.worksAt ? ` · ${s.worksAt}` : ''}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {facts.map((f) => (
            <div key={f} style={{ display: 'flex', fontSize: 34, color: OG.ink, fontWeight: 700 }}>
              {f}
            </div>
          ))}
          {facts.length === 0 ? (
            <div style={{ display: 'flex', fontSize: 30, color: OG.muted }}>{SITE_TAGLINE}</div>
          ) : null}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 26, color: OG.muted }}>
            Портфолио, отзывы и подтверждённые сделки
          </div>
          <div style={{ display: 'flex', fontFamily: 'Serif', fontSize: 36, fontWeight: 700, color: OG.ink }}>
            {SITE_NAME}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts },
  )
}
