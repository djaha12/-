import { ImageResponse } from 'next/og'
import { getCase } from '@/server/data'
import { coverDataUrl, formatNumOg, formatSomOg, loadOgFonts, ogTitle, OG } from '@/server/og/render'
import { SITE_NAME, SITE_URL } from '@/lib/site'

export const dynamic = 'force-dynamic'

const DEAL_LABEL: Record<string, string> = {
  sale: 'Продажа',
  rentOut: 'Аренда',
  buyAssist: 'Подбор',
}

/**
 * Вертикальная визитка кейса для сторис (1080×1920) — маркетинговый инструмент
 * специалиста: скачал → выложил в Instagram/Telegram → привёл клиентов на Ателье.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getCase(slug)
  if (!data) return new Response('Not found', { status: 404 })
  const { item, author } = data
  const deal = item.deal
  const cover = await coverDataUrl(item.image.src)
  const fonts = await loadOgFonts()
  // локальный fallback не печатаем на визитке — она уходит наружу
  const host = /localhost|127\.0\.0\.1/.test(SITE_URL) ? null : SITE_URL.replace(/^https?:\/\//, '')

  const monthly = deal?.type === 'rentOut' ? '/мес' : ''
  const price = deal?.price
    ? formatSomOg(deal.price) + monthly
    : deal?.priceFrom && deal?.priceTo
      ? `${formatNumOg(deal.priceFrom)}–${formatSomOg(deal.priceTo)}${monthly}`
      : null

  const image = new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: OG.paper,
          fontFamily: 'Sans',
        }}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            width={1080}
            height={1040}
            style={{ width: 1080, height: 1040, objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 1080,
              height: 1040,
              backgroundColor: OG.accentSoft,
              color: OG.accent,
              fontFamily: 'Serif',
              fontSize: 120,
              fontWeight: 700,
            }}
          >
            {SITE_NAME}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            justifyContent: 'space-between',
            padding: '64px 72px 160px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {deal ? (
                <div
                  style={{
                    display: 'flex',
                    flexShrink: 0,
                    backgroundColor: OG.accentSoft,
                    color: OG.accent,
                    borderRadius: 999,
                    padding: '12px 28px',
                    fontSize: 34,
                    fontWeight: 700,
                  }}
                >
                  {DEAL_LABEL[deal.type] ?? 'Сделка'} · {deal.propertyType}
                </div>
              ) : null}
              {deal?.confirmed ? (
                <div
                  style={{
                    display: 'flex',
                    flexShrink: 0,
                    backgroundColor: '#e5f2ea',
                    color: OG.success,
                    borderRadius: 999,
                    padding: '12px 28px',
                    fontSize: 34,
                    fontWeight: 700,
                  }}
                >
                  Подтверждено клиентом
                </div>
              ) : null}
            </div>

            <div
              style={{
                display: 'block',
                marginTop: 40,
                fontFamily: 'Serif',
                fontSize: 76,
                lineHeight: 1.1,
                fontWeight: 700,
                color: OG.ink,
                maxHeight: 260,
                overflow: 'hidden',
              }}
            >
              {ogTitle(item.title)}
            </div>

            {price ? (
              <div style={{ display: 'flex', marginTop: 36, fontSize: 56, fontWeight: 700, color: OG.accent }}>
                {price}
              </div>
            ) : null}
            {deal?.daysOnMarket ? (
              <div style={{ display: 'flex', marginTop: 14, fontSize: 36, color: OG.muted }}>
                {deal.type === 'rentOut' ? 'Сдано' : 'Продано'} за {deal.daysOnMarket} дн. · {item.location}
              </div>
            ) : null}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: `2px solid ${OG.border}`,
              paddingTop: 44,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: OG.ink }}>
                {author.name}
              </div>
              <div style={{ display: 'flex', marginTop: 6, fontSize: 30, color: OG.muted }}>
                {author.profession}
                {author.rating > 0 ? ` · рейтинг ${author.rating.toFixed(1)}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', fontFamily: 'Serif', fontSize: 48, fontWeight: 700, color: OG.ink }}>
                {SITE_NAME}
              </div>
              {host ? (
                <div style={{ display: 'flex', fontSize: 28, color: OG.muted }}>{host}</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920, fonts },
  )

  // ?download=1 — сохранить файлом (кнопка «визитка для сторис» на кейсе)
  if (new URL(req.url).searchParams.get('download') === '1') {
    const headers = new Headers(image.headers)
    headers.set('content-disposition', `attachment; filename="atelier-${slug}.png"`)
    return new Response(image.body, { headers })
  }
  return image
}
