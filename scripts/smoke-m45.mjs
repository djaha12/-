// Смоук M4.5: воркер авто-подтверждения + брифы/отклики.
// Требует: сервер на :3000 c OTP_DEV_MODE=1 и CRON_SECRET=smoke-cron.
import { execSync } from 'node:child_process'

const BASE = 'http://127.0.0.1:3000'
const CRON_SECRET = 'smoke-cron'
const PSQL = `/usr/lib/postgresql/16/bin/psql -h localhost -p 5433 -U atelier -d atelier -tAc`

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
  return {
    status: res.status,
    data: body?.result?.data?.json,
    error: body?.error?.json?.message,
    setCookie: res.headers.get('set-cookie'),
  }
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
  const created = await api(cookie)('cases.create', {
    kind: 'deal', title, images: [img], districtName: 'Асанбай', consent: true,
    dealType: 'sale', propertyType: 'Вторичка', price: 3000000, priceVisibility: 'range', daysOnMarket: 12,
  })
  return created.data.slug
}

/* ————— A. Авто-подтверждение ————— */
async function autoConfirm() {
  const specCookie = await login('+996700088012')
  const clientCookie = await login('+996700088011')
  const spec = api(specCookie)
  const client = api(clientCookie)

  const caseSlug = await publishCase(specCookie, 'Смоук М4.5: продажа однушки')
  const caseHtml = await (await fetch(`${BASE}/case/${caseSlug}`)).text()
  const specSlug = caseHtml.match(/\/s\/(s-[a-z0-9]+)/)?.[1]
  const lead = await client('leads.create', {
    specialistSlug: specSlug,
    text: 'Здравствуйте! Хочу продать однушку, помогите с оценкой и продажей.',
  })
  const threadId = lead.data.threadId
  const proposed = await spec('orders.propose', { threadId, title: 'Продажа однушки' })
  const orderId = proposed.data.orderId
  await client('orders.transition', { orderId, to: 'agreed' })
  await spec('orders.transition', { orderId, to: 'in_progress' })
  await spec('orders.transition', { orderId, to: 'delivered' })
  const st = await spec('orders.forThread', { threadId }, 'query')
  console.log('1. заказ сдан, autoConfirmAt назначен:', st.data.autoConfirmAt ? '✓' : 'НЕТ')

  // без секрета — наглухо закрыто
  const noAuth = await fetch(`${BASE}/api/cron/auto-confirm`, { method: 'POST' })
  console.log('2. крон без секрета:', noAuth.status === 401 ? '✓ 401' : noAuth.status)

  // до дедлайна воркер ничего не трогает
  const early = await (await fetch(`${BASE}/api/cron/auto-confirm`, {
    method: 'POST', headers: { authorization: `Bearer ${CRON_SECRET}` },
  })).json()
  console.log('3. до дедлайна не завершает:', early.completed === 0 ? '✓' : JSON.stringify(early))

  // сдвигаем дедлайн в прошлое (симуляция +7 дней) и зовём крон
  execSync(`${PSQL} "UPDATE \\"Order\\" SET \\"autoConfirmAt\\" = now() - interval '1 hour' WHERE id = '${orderId}'"`)
  const run = await (await fetch(`${BASE}/api/cron/auto-confirm`, {
    method: 'POST', headers: { authorization: `Bearer ${CRON_SECRET}` },
  })).json()
  console.log('4. просроченный завершён системой:', run.completed >= 1 ? `✓ (${run.completed})` : JSON.stringify(run))

  const after = await client('orders.forThread', { threadId }, 'query')
  console.log('5. состояние completed:', after.data.state === 'completed' ? '✓' : after.data.state)
  const auto = execSync(`${PSQL} "SELECT \\"autoConfirmed\\" FROM \\"Order\\" WHERE id = '${orderId}'"`).toString().trim()
  const ev = execSync(`${PSQL} "SELECT count(*) FROM \\"OrderEvent\\" WHERE \\"orderId\\" = '${orderId}' AND reason = 'auto_confirm' AND \\"byUserId\\" IS NULL"`).toString().trim()
  console.log('6. autoConfirmed + системное событие:', auto === 't' && ev === '1' ? '✓' : `${auto}/${ev}`)

  // авто-завершение открывает право на отзыв
  const review = await client('reviews.create', { orderId, quality: 5, timing: 4, communication: 5, budget: 5, text: 'Заказ завершился сам, но работа сделана отлично — рекомендую!' })
  console.log('7. отзыв после авто-завершения:', review.data?.ok ? '✓' : review.error)

  // повторный прогон идемпотентен
  const again = await (await fetch(`${BASE}/api/cron/auto-confirm`, {
    method: 'POST', headers: { authorization: `Bearer ${CRON_SECRET}` },
  })).json()
  console.log('8. повторный прогон пуст:', again.completed === 0 ? '✓' : JSON.stringify(again))
}

/* ————— B. Брифы ————— */
async function briefs() {
  const clientCookie = await login('+996700088011')
  const specCookie = await login('+996700088012') // уже специалист (кейс из блока A)
  const spec2Cookie = await login('+996700088013') // без профиля — «не специалист»
  const client = api(clientCookie)
  const spec = api(specCookie)
  const spec2 = api(spec2Cookie)

  const guest = await api()('briefs.create', { title: 'Гостевой бриф', description: 'Достаточно длинное описание задачи для валидации.' })
  console.log('9. гость не создаёт бриф:', guest.status === 401 ? '✓ 401' : guest.status)

  const created = await client('briefs.create', {
    title: 'Смоук: продать студию на Асанбае',
    description: 'Студия 30 м², жилое состояние, документы готовы. Нужны оценка и быстрая продажа.',
    objectType: 'apartment', districtName: 'Асанбай', budgetMin: 2500000, budgetMax: 2800000,
  })
  const briefId = created.data.id
  console.log('10. бриф создан:', briefId ? '✓' : created.error)

  // владелец-специалист: профиль есть, но на собственный бриф отклик закрыт
  const specOwnBrief = await spec('briefs.create', {
    title: 'Смоук: бриф самого специалиста',
    description: 'Специалист тоже бывает клиентом — но откликаться сам себе не может.',
  })
  const own = await spec('briefs.respond', { briefId: specOwnBrief.data.id, message: 'Сам себе откликаюсь — так нельзя.' })
  console.log('11. на свой бриф нельзя:', own.status === 400 ? `✓ 400 («${own.error}»)` : own.status)

  const noProfile = await spec2('briefs.respond', { briefId, message: 'Я пока не специалист, но очень хочу.' })
  console.log('12. без профиля нельзя:', noProfile.status === 403 ? '✓ 403' : noProfile.status)

  const foreignCase = await spec('briefs.respond', { briefId, message: 'Прикладываю чужой кейс как свой.', caseSlugs: ['dvushka-toktogula'] })
  console.log('13. чужой кейс отклонён:', foreignCase.status === 400 ? '✓ 400' : foreignCase.status)

  const myCase = await publishCase(specCookie, 'Смоук М4.5: кейс для отклика')
  const responded = await spec('briefs.respond', {
    briefId, message: 'Продавал похожие студии в этом районе, начну с оценки по свежим сделкам.',
    priceEstimate: 2700000, caseSlugs: [myCase],
  })
  console.log('14. отклик принят:', responded.data?.id ? '✓' : responded.error)

  const dup = await spec('briefs.respond', { briefId, message: 'Ещё разок откликнусь для верности!' })
  console.log('15. второй отклик отклонён:', dup.status === 400 ? `✓ 400 («${dup.error}»)` : dup.status)

  // владелец видит отклик на странице; статус «просмотрен» проставляется
  const ownerHtml = await (await fetch(`${BASE}/briefs/${briefId}`, { headers: { cookie: clientCookie } })).text()
  console.log('16. владелец видит отклик:', ownerHtml.includes('оценки по свежим сделкам') ? '✓' : 'НЕТ')
  const viewed = execSync(`${PSQL} "SELECT status FROM \\"BriefResponse\\" WHERE \\"briefId\\" = '${briefId}'"`).toString().trim()
  console.log('17. статус VIEWED после просмотра:', viewed === 'VIEWED' ? '✓' : viewed)

  // посторонний клиент бриф не видит (страница), API accept чужим тоже закрыт
  const spyHtml = await fetch(`${BASE}/briefs/${briefId}`, { headers: { cookie: spec2Cookie } })
  console.log('18. постороннему бриф недоступен:', spyHtml.status === 404 ? '✓ 404' : spyHtml.status)

  const responseId = execSync(`${PSQL} "SELECT id FROM \\"BriefResponse\\" WHERE \\"briefId\\" = '${briefId}'"`).toString().trim()
  const spyAccept = await spec2('briefs.accept', { responseId })
  console.log('19. чужой accept закрыт:', spyAccept.status === 404 ? '✓ 404' : spyAccept.status)

  const accepted = await client('briefs.accept', { responseId })
  const threadId = accepted.data?.threadId
  console.log('20. клиент открыл чат:', threadId ? '✓' : accepted.error)
  const msgs = await client('chat.messages', { threadId }, 'query')
  const hasBriefMsg = msgs.data.some((m) => m.text.includes('По брифу «Смоук: продать студию на Асанбае»'))
  console.log('21. сообщение с контекстом брифа:', hasBriefMsg ? '✓' : 'НЕТ')
  const again = await client('briefs.accept', { responseId })
  const count2 = (await client('chat.messages', { threadId }, 'query')).data.filter((m) => m.text.includes('По брифу')).length
  console.log('22. accept идемпотентен:', again.data.threadId === threadId && count2 === 1 ? '✓' : `${count2} сообщений`)

  const closed = await client('briefs.close', { briefId })
  console.log('23. бриф закрыт владельцем:', closed.data?.ok ? '✓' : closed.error)
  const lateCase = await publishCase(specCookie, 'Смоук М4.5: поздний кейс')
  const late = await spec('briefs.respond', { briefId, message: 'Опоздал с откликом — бриф уже закрыт.', caseSlugs: [lateCase] })
  console.log('24. отклик в закрытый бриф:', late.status === 400 ? '✓ 400' : late.status)
}

try {
  await autoConfirm()
  await briefs()
} catch (e) {
  console.error(e)
  process.exit(1)
}
