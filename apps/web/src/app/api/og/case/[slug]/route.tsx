import { ImageResponse } from 'next/og'
import { getCase } from '@/server/data'
import { coverDataUrl, formatSomOg, loadOgFonts, OG } from '@/server/og/render'
import { SITE_NAME } from '@/lib/site'

export const dynamic = 'force-dynamic'

const DEAL_LABEL: Record<string, string> = {
  sale: 'Продажа',
  rentOut: 'Аренда',
  buyAssist: 'Подбор',
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getCase(slug)
  if (!data) return new Response('Not found', { status: 404 })
  const { item, author } = data
  const deal = item.deal
  const cover = await coverDataUrl(item.image.src)
  const fonts = await loadOgFonts()

  const price = deal?.price
    ? formatSomOg(deal.price)
    : deal?.priceFrom && deal?.priceTo
      ? `${new Intl.NumberFormat('ru-RU').format(deal.priceFrom)}–${formatSomOg(deal.priceTo)}`
      : item.budgetFrom > 0
        ? `${new Intl.NumberFormat('ru-RU').format(item.budgetFrom)}–${formatSomOg(item.budgetTo)}`
        : null

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: OG.paper,
          fontFamily: 'Sans',
        }}
      >
        {/* текстовая колонка */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '56px 56px 48px',
            width: cover ? 660 : 1200,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {deal ? (
                <div
                  style={{
                    display: 'flex',
                    flexShrink: 0,
                    backgroundColor: OG.accentSoft,
                    color: OG.accent,
                    borderRadius: 999,
                    padding: '8px 20px',
                    fontSize: 24,
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
                    padding: '8px 20px',
                    fontSize: 24,
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
                marginTop: 28,
                fontFamily: 'Serif',
                fontSize: 58,
                lineHeight: 1.12,
                color: OG.ink,
                fontWeight: 700,
                maxHeight: 200,
                overflow: 'hidden',
              }}
            >
              {item.title}
            </div>
            {price ? (
              <div style={{ display: 'flex', marginTop: 24, fontSize: 40, fontWeight: 700, color: OG.accent }}>
                {price}
              </div>
            ) : null}
            {deal?.daysOnMarket ? (
              <div style={{ display: 'flex', marginTop: 10, fontSize: 26, color: OG.muted }}>
                Продано за {deal.daysOnMarket} дн. · {item.location}
              </div>
            ) : (
              <div style={{ display: 'flex', marginTop: 10, fontSize: 26, color: OG.muted }}>
                {item.location}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: OG.ink }}>
                {author.name}
              </div>
              <div style={{ display: 'flex', fontSize: 22, color: OG.muted }}>
                {author.profession}
                {author.rating > 0 ? ` · рейтинг ${author.rating.toFixed(1)}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', fontFamily: 'Serif', fontSize: 34, fontWeight: 700, color: OG.ink }}>
              {SITE_NAME}
            </div>
          </div>
        </div>

        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            width={540}
            height={630}
            style={{ width: 540, height: 630, objectFit: 'cover' }}
          />
        ) : null}
      </div>
    ),
    { width: 1200, height: 630, fonts },
  )
}
