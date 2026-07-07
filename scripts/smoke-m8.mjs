// Смоук M8: инструментовка петли — событие шеринга + атрибуция источника заявки.
// Требует сервер :3000 с OTP_DEV_MODE=1. Очистка после: psql -f scripts/smoke-cleanup.sql
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

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function publishCase(cookie, title) {
  const form = new FormData()
  form.append('file', new Blob([png], { type: 'image/png' }), 's.png')
  const up = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form, headers: { cookie } })
  const img = await up.json()
  return api(cookie)('cases.create', {
    kind: 'deal', title, images: [img], districtName: 'Асанбай', consent: true,
    dealType: 'sale', propertyType: 'Вторичка', price: 3000000, priceVisibility: 'range', daysOnMarket: 10,
  })
}

// последний источник заявки клиента из outbox
const leadSource = (clientId) =>
  psql(`SELECT props->>'source' FROM \\"AnalyticsOutbox\\" WHERE \\"eventName\\"='lead_created' AND \\"actorId\\"='${clientId}' ORDER BY \\"occurredAt\\" DESC LIMIT 1`)
const sharedCount = (where) =>
  Number(psql(`SELECT count(*) FROM \\"AnalyticsOutbox\\" WHERE \\"eventName\\"='content_shared' AND ${where}`))

let pass = 0, fail = 0
const check = (n, ok, got) => { console.log(`${n}:`, ok ? '✓' : `✗ (${got})`); ok ? pass++ : fail++ }

const main = async () => {
  const SPEC = '+996700088051'
  const CLIENT = '+996700088052'
  const specCookie = await login(SPEC)
  const clientCookie = await login(CLIENT)
  psql(`UPDATE \\"User\\" SET \\"trustTier\\"='TRUSTED' WHERE phone LIKE '+9967000880%'`)
  const client = api(clientCookie)
  const anon = api()
  const clientId = psql(`SELECT id FROM \\"User\\" WHERE phone='${CLIENT}'`)
  check('1. вход спец+клиент', Boolean(clientId), clientId)

  const c1 = await publishCase(specCookie, 'Смоук М8: кейс')
  const caseHtml = await (await fetch(`${BASE}/case/${c1.data.slug}`)).text()
  const specSlug = caseHtml.match(/\/s\/(s-[a-z0-9]+)/)?.[1]
  check('2. кейс опубликован', Boolean(specSlug), c1.error ?? specSlug)

  // событие шеринга (авторизованный) — визитка-сторис
  const sh = await client('analytics.share', { surface: 'case', method: 'story', slug: c1.data.slug })
  check('3. analytics.share ok', sh.status === 200 && sh.data?.ok === true, sh.status)
  check('4. content_shared записан (method=story)',
    sharedCount(`\\"actorId\\"='${clientId}' AND props->>'method'='story' AND props->>'surface'='case'`) === 1,
    'нет строки')

  // гость тоже может делиться (публичная процедура, actorId null)
  await anon('analytics.share', { surface: 'profile', method: 'copy', slug: 'guest-marker-m8' })
  check('5. гость: content_shared (actorId null)',
    sharedCount(`\\"actorId\\" IS NULL AND props->>'slug'='guest-marker-m8'`) === 1, 'нет строки')

  // атрибуция источника заявки: без метки → direct
  await client('leads.create', { specialistSlug: specSlug, text: 'Здравствуйте, продаю квартиру — нужна помощь.' })
  check('6. заявка без ref → source=direct', leadSource(clientId) === 'direct', leadSource(clientId))

  // помеченная (?ref=share) → share
  await client('leads.create', { specialistSlug: specSlug, text: 'Второй вопрос по этой же квартире, детали.', source: 'share' })
  check('7. заявка с ref=share → source=share', leadSource(clientId) === 'share', leadSource(clientId))

  // произвольная метка из URL схлопывается в other
  await client('leads.create', { specialistSlug: specSlug, text: 'Третий вопрос, ещё уточнение по цене.', source: 'promo_xyz123' })
  check('8. неизвестный ref → source=other', leadSource(clientId) === 'other', leadSource(clientId))

  // вход по ?ref= не ломает рендер страницы
  const refPage = await fetch(`${BASE}/case/${c1.data.slug}?ref=share`)
  check('9. страница с ?ref=share рендерится', refPage.status === 200, refPage.status)

  console.log(`\n${pass}/${pass + fail} проверок пройдено`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
