// Смоук M7: SEO (metadata/OG/JSON-LD/sitemap/robots) + аналитика + дашборд.
// Требует: сервер :3000 с OTP_DEV_MODE=1; сид (кейс dvushka-toktogula, модератор).
// Очистка после: psql -f scripts/smoke-cleanup.sql
import { execSync } from 'node:child_process'

const BASE = 'http://127.0.0.1:3000'
const PSQL = `/usr/lib/postgresql/16/bin/psql -h localhost -p 5433 -U atelier -d atelier -tAc`
const psql = (q) => execSync(`${PSQL} "${q}"`).toString().trim()

const api = (cookie) => async (path, input, method = 'mutation') => {
  const url =
    method === 'query'
      ? `${BASE}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
      : `${BASE}/api/trpc/${path}`
  const res = await fetch(url, {
    method: method === 'query' ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(method === 'query' ? {} : { body: JSON.stringify({ json: input }) }),
  })
  const body = await res.json()
  return { status: res.status, data: body?.result?.data?.json, error: body?.error?.json?.message, setCookie: res.headers.get('set-cookie') }
}

async function login(phone) {
  const anon = api()
  const r1 = await anon('auth.requestOtp', { phone })
  const r2 = await anon('auth.verifyOtp', { phone, code: r1.data.devCode })
  return r2.setCookie.split(';')[0]
}

const CASE = 'dvushka-toktogula'
const PROFILE = 'nurlan-abdykadyrov'

const main = async () => {
  // --- SEO ---
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text()
  console.log('1. sitemap.xml с кейсами и профилями:',
    sitemap.includes(`/case/${CASE}`) && sitemap.includes(`/s/${PROFILE}`) ? '✓' : 'НЕТ')
  const robots = await (await fetch(`${BASE}/robots.txt`)).text()
  console.log('2. robots.txt закрывает приватное:',
    robots.includes('Disallow: /admin') && robots.includes('Disallow: /messages') && robots.includes('sitemap.xml') ? '✓' : 'НЕТ')

  const caseHtml = await (await fetch(`${BASE}/case/${CASE}`)).text()
  console.log('3. og:image кейса → генератор:', caseHtml.includes(`/api/og/case/${CASE}`) ? '✓' : 'НЕТ')
  console.log('4. canonical кейса:', caseHtml.includes(`rel="canonical" href="http://127.0.0.1:3000/case/${CASE}"`) ? '✓' : 'НЕТ')
  const ldMatches = [...caseHtml.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]))
  const creative = ldMatches.find((d) => d['@type'] === 'CreativeWork')
  const crumbs = ldMatches.find((d) => d['@type'] === 'BreadcrumbList')
  console.log('5. JSON-LD кейса (CreativeWork + крошки):', creative?.author?.name && crumbs ? '✓' : 'НЕТ')

  const profHtml = await (await fetch(`${BASE}/s/${PROFILE}`)).text()
  const profLd = [...profHtml.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]))
  const agent = profLd.find((d) => d['@type'] === 'RealEstateAgent')
  console.log('6. профиль риелтора: RealEstateAgent + рейтинг:',
    agent && agent.aggregateRating?.ratingValue > 0 ? `✓ (${agent.aggregateRating.ratingValue})` : 'НЕТ')
  console.log('7. og:image профиля:', profHtml.includes(`/api/og/profile/${PROFILE}`) ? '✓' : 'НЕТ')

  // --- OG-генераторы ---
  const og = await fetch(`${BASE}/api/og/case/${CASE}`)
  const ogBytes = (await og.arrayBuffer()).byteLength
  console.log('8. OG-карточка кейса рендерится:',
    og.status === 200 && og.headers.get('content-type')?.includes('image/png') && ogBytes > 20_000 ? `✓ png ${(ogBytes / 1024).toFixed(0)}KB` : `${og.status}/${ogBytes}`)
  const ogProfile = await fetch(`${BASE}/api/og/profile/${PROFILE}`)
  console.log('9. OG профиля рендерится:', ogProfile.status === 200 ? '✓' : ogProfile.status)
  const story = await fetch(`${BASE}/api/og/story/${CASE}?download=1`)
  const storyBytes = (await story.arrayBuffer()).byteLength
  console.log('10. сторис-визитка 1080×1920 + attachment:',
    story.status === 200 && story.headers.get('content-disposition')?.includes('attachment') && storyBytes > 30_000 ? `✓ png ${(storyBytes / 1024).toFixed(0)}KB` : `${story.status}`)
  const og404 = await fetch(`${BASE}/api/og/case/net-takogo-keysa`)
  console.log('11. OG несуществующего кейса:', og404.status === 404 ? '✓ 404' : og404.status)

  // --- аналитика ---
  const before = Number(psql(`SELECT count(*) FROM \\"AnalyticsOutbox\\" WHERE \\"eventName\\"='lead_created'`))
  const specCookie = await login('+996700088041')
  const clientCookie = await login('+996700088042')
  psql(`UPDATE \\"User\\" SET \\"trustTier\\"='TRUSTED' WHERE phone LIKE '+9967000880%'`)
  const spec = api(specCookie)
  const client = api(clientCookie)
  // кейс + заявка → события
  const form = new FormData()
  form.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')], { type: 'image/png' }), 's.png')
  const up = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form, headers: { cookie: specCookie } })
  const img = await up.json()
  const created = await spec('cases.create', { kind: 'deal', title: 'Смоук М7: продажа для аналитики', images: [img], districtName: 'Асанбай', consent: true, dealType: 'sale', propertyType: 'Вторичка', price: 3200000, priceVisibility: 'range', daysOnMarket: 15 })
  const html = await (await fetch(`${BASE}/case/${created.data.slug}`)).text()
  const specSlug = html.match(/\/s\/(s-[a-z0-9]+)/)?.[1]
  await client('leads.create', { specialistSlug: specSlug, text: 'Здравствуйте! Интересует похожая продажа.' })
  const after = Number(psql(`SELECT count(*) FROM \\"AnalyticsOutbox\\" WHERE \\"eventName\\"='lead_created'`))
  console.log('12. lead_created пишется в outbox:', after === before + 1 ? '✓' : `${before}→${after}`)
  const published = Number(psql(`SELECT count(*) FROM \\"AnalyticsOutbox\\" WHERE \\"eventName\\"='case_published' AND \\"actorId\\" IS NOT NULL`))
  console.log('13. case_published пишется:', published >= 1 ? '✓' : published)
  const logins = Number(psql(`SELECT count(*) FROM \\"AnalyticsOutbox\\" WHERE \\"eventName\\"='session_login'`))
  console.log('14. session_login пишется:', logins >= 2 ? `✓ (${logins})` : logins)

  // --- дашборд ---
  const statsAsClient = await fetch(`${BASE}/admin/stats`, { headers: { cookie: clientCookie } })
  console.log('15. /admin/stats клиенту:', statsAsClient.status === 404 ? '✓ 404' : statsAsClient.status)
  const modCookie = await login('+996700000099')
  const statsHtml = await (await fetch(`${BASE}/admin/stats`, { headers: { cookie: modCookie } })).text()
  console.log('16. дашборд модератору:', statsHtml.includes('Воронка доверия') && statsHtml.includes('Пользователей') ? '✓' : 'НЕТ')
  const guests = await fetch(`${BASE}/admin/stats`)
  console.log('17. дашборд гостю:', guests.status === 404 ? '✓ 404' : guests.status)
}

try {
  await main()
} catch (e) {
  console.error(e)
  process.exit(1)
}
