// Смоук M6: уведомления (in-app) → Telegram-привязка (вебхук) → тарифы Free/PRO + промокод.
// Требует: сервер :3000 с OTP_DEV_MODE=1, TELEGRAM_WEBHOOK_SECRET=smoke-tg,
// NEXT_PUBLIC_TELEGRAM_BOT=atelier_demo_bot; сид (промокод ATELIER-LAUNCH).
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

const notifCount = (phone, type) =>
  Number(psql(`SELECT count(*) FROM \\"Notification\\" n JOIN \\"User\\" u ON u.id=n.\\"userId\\" WHERE u.phone='${phone}' AND n.type='${type}'`))

const main = async () => {
  const SPEC = '+996700088051'
  const CLIENT = '+996700088052'
  const specCookie = await login(SPEC)
  const clientCookie = await login(CLIENT)
  psql(`UPDATE \\"User\\" SET \\"trustTier\\"='TRUSTED' WHERE phone LIKE '+9967000880%'`)
  const spec = api(specCookie)
  const client = api(clientCookie)
  console.log('1. вход специалиста и клиента: ✓')

  // гость не видит центр уведомлений
  const guest = await fetch(`${BASE}/notifications`, { redirect: 'follow' })
  console.log('2. /notifications гостю → логин:', guest.url.includes('/login') ? '✓' : guest.url)

  // заявка → уведомление специалисту
  const c1 = await publishCase(specCookie, 'Смоук М6: кейс 1')
  const caseHtml = await (await fetch(`${BASE}/case/${c1.data.slug}`)).text()
  const specSlug = caseHtml.match(/\/s\/(s-[a-z0-9]+)/)?.[1]
  await client('leads.create', { specialistSlug: specSlug, text: 'Здравствуйте! Продаю квартиру, нужна ваша помощь.' })
  console.log('3. заявка → lead_new у специалиста:', notifCount(SPEC, 'lead_new') === 1 ? '✓' : notifCount(SPEC, 'lead_new'))

  // колокольчик с непрочитанными в шапке
  const home = await (await fetch(`${BASE}/`, { headers: { cookie: specCookie } })).text()
  console.log('4. бейдж непрочитанных в шапке:', home.includes('непрочитанных:') ? '✓' : 'НЕТ')

  // открытие центра помечает прочитанным
  const center = await (await fetch(`${BASE}/notifications`, { headers: { cookie: specCookie } })).text()
  const unreadAfter = psql(`SELECT count(*) FROM \\"Notification\\" n JOIN \\"User\\" u ON u.id=n.\\"userId\\" WHERE u.phone='${SPEC}' AND n.\\"readAt\\" IS NULL`)
  console.log('5. центр показывает и помечает прочитанным:', center.includes('Новая заявка') && unreadAfter === '0' ? '✓' : `${unreadAfter} unread`)

  // полный цикл заказа → уведомления обеим сторонам
  const threadId = psql(`SELECT ct.id FROM \\"ChatThread\\" ct JOIN \\"ChatParticipant\\" p ON p.\\"threadId\\"=ct.id JOIN \\"User\\" u ON u.id=p.\\"userId\\" WHERE u.phone='${SPEC}' ORDER BY ct.\\"createdAt\\" DESC LIMIT 1`)
  const proposed = await spec('orders.propose', { threadId, title: 'Продажа квартиры клиента' })
  await client('orders.transition', { orderId: proposed.data.orderId, to: 'agreed' })
  await spec('orders.transition', { orderId: proposed.data.orderId, to: 'in_progress' })
  await spec('orders.transition', { orderId: proposed.data.orderId, to: 'delivered' })
  await client('orders.transition', { orderId: proposed.data.orderId, to: 'completed' })
  const ok6 =
    notifCount(CLIENT, 'order_proposed') === 1 &&
    notifCount(SPEC, 'order_agreed') === 1 &&
    notifCount(CLIENT, 'order_delivered') === 1 &&
    notifCount(CLIENT, 'order_completed') === 1 &&
    notifCount(SPEC, 'order_completed') === 1
  console.log('6. цикл заказа: уведомления обеим сторонам:', ok6 ? '✓ (5 шт.)' : 'НЕ ВСЕ')
  await client('reviews.create', { orderId: proposed.data.orderId, quality: 5, timing: 5, communication: 5, budget: 5, text: 'Отличная работа, спасибо за скорость и честность!' })
  console.log('7. отзыв → review_new специалисту:', notifCount(SPEC, 'review_new') === 1 ? '✓' : 'НЕТ')

  // Free-лимит: 5 кейсов уже? c1 + ещё 4 = 5, шестой должен упереться
  for (let i = 2; i <= 5; i++) await publishCase(specCookie, `Смоук М6: кейс ${i}`)
  const sixth = await publishCase(specCookie, 'Смоук М6: кейс 6 сверх лимита')
  console.log('8. Free: 6-й кейс отклонён:', sixth.status === 400 && /PRO/.test(sixth.error ?? '') ? `✓ 400` : sixth.status)

  // промокод
  const bad = await spec('promo.redeem', { code: 'NE-SUSHCHESTVUET' })
  console.log('9. неверный промокод:', bad.status === 400 ? '✓ 400' : bad.status)
  const redeemed = await spec('promo.redeem', { code: 'atelier-launch' })
  console.log('10. ATELIER-LAUNCH активирует PRO:', redeemed.data?.plan === 'PRO' ? `✓ до ${new Date(redeemed.data.until).toLocaleDateString('ru-RU')}` : redeemed.error)
  const sixthPro = await publishCase(specCookie, 'Смоук М6: кейс 6 на PRO')
  console.log('11. на PRO лимит снят:', sixthPro.data?.slug ? '✓' : sixthPro.error)
  const again = await spec('promo.redeem', { code: 'ATELIER-LAUNCH' })
  console.log('12. повторный redeem при активном PRO:', again.status === 400 ? '✓ 400' : again.status)

  // PRO-бейдж в каталоге
  const catalog = await (await fetch(`${BASE}/specialists`)).text()
  console.log('13. бейдж PRO в каталоге:', catalog.includes('>PRO<') ? '✓' : 'НЕТ')

  // Telegram: вебхук
  const noSecret = await fetch(`${BASE}/api/telegram/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  console.log('14. вебхук без секрета:', noSecret.status === 401 ? '✓ 401' : noSecret.status)
  const tg = (body) =>
    fetch(`${BASE}/api/telegram/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'smoke-tg' },
      body: JSON.stringify(body),
    })
  const badToken = await tg({ message: { text: '/start EVIL-TOKEN', chat: { id: 777001 } } })
  const linkedEarly = psql(`SELECT count(*) FROM \\"User\\" WHERE \\"telegramChatId\\"='777001'`)
  console.log('15. /start с поддельным токеном не привязывает:', badToken.status === 200 && linkedEarly === '0' ? '✓' : linkedEarly)

  const settings = await (await fetch(`${BASE}/settings/notifications`, { headers: { cookie: specCookie } })).text()
  const startToken = settings.match(/t\.me\/[\w_]+\?start=([\w-]+)/)?.[1]
  console.log('16. deep-link на странице настроек:', startToken ? '✓' : 'НЕТ')
  await tg({ message: { text: `/start ${startToken}`, chat: { id: 777001 } } })
  const linked = psql(`SELECT \\"telegramChatId\\" FROM \\"User\\" WHERE phone='${SPEC}'`)
  console.log('17. привязка по токену:', linked === '777001' ? '✓' : linked)
  await tg({ message: { text: '/stop', chat: { id: 777001 } } })
  const unlinked = psql(`SELECT count(*) FROM \\"User\\" WHERE \\"telegramChatId\\"='777001'`)
  console.log('18. /stop отвязывает:', unlinked === '0' ? '✓' : unlinked)

  // PWA
  const manifest = await (await fetch(`${BASE}/manifest.webmanifest`)).json()
  const icon = await fetch(`${BASE}/icon-192.png`)
  console.log('19. PWA-манифест и иконка:', manifest.name === 'Ателье' && icon.status === 200 ? '✓' : 'НЕТ')
  const pro = await (await fetch(`${BASE}/pro`)).text()
  console.log('20. /pro открыта гостю:', pro.includes('Free') && pro.includes('Активировать PRO') ? '✓' : 'НЕТ')
}

try {
  await main()
} catch (e) {
  console.error(e)
  process.exit(1)
}
