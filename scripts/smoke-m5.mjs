// Смоук M5: премодерация новичков → админка → жалобы → страйки → заморозка.
// Требует: сервер :3000 с OTP_DEV_MODE=1; модератор из сида (+996700000099).
// Очистка после: psql -f scripts/smoke-cleanup.sql
import { createHmac } from 'node:crypto'
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
    dealType: 'sale', propertyType: 'Вторичка', price: 3000000, priceVisibility: 'range', daysOnMarket: 10,
  })
  return created.data
}

const main = async () => {
  // роли: новичок-специалист, клиент, модератор из сида
  const specCookie = await login('+996700088031')
  const clientCookie = await login('+996700088032')
  const modCookie = await login('+996700000099')
  const spec = api(specCookie)
  const client = api(clientCookie)
  const mod = api(modCookie)
  console.log('1. вход новичка, клиента и модератора: ✓')

  // премодерация: первый кейс новичка не публикуется сразу
  const c1 = await publishCase(specCookie, 'Смоук М5: продажа студии, кейс 1')
  console.log('2. кейс новичка ушёл на проверку:', c1.pending ? '✓ pending' : 'ОПУБЛИКОВАЛСЯ (дыра!)')
  const feed = await (await fetch(`${BASE}/?type=deals`)).text()
  console.log('3. в ленте кейса нет:', feed.includes('кейс 1') ? 'ЕСТЬ (утечка!)' : '✓')
  const strangerView = await fetch(`${BASE}/case/${c1.slug}`, { headers: { cookie: clientCookie } })
  console.log('4. постороннему кейс недоступен:', strangerView.status === 404 ? '✓ 404' : strangerView.status)
  const authorView = await (await fetch(`${BASE}/case/${c1.slug}`, { headers: { cookie: specCookie } })).text()
  console.log('5. автор видит кейс с баннером «на проверке»:', authorView.includes('Кейс на проверке') ? '✓' : 'НЕТ')
  // модератор обязан видеть кейс целиком — премодерация по обложке из очереди не работает
  const modView = await fetch(`${BASE}/case/${c1.slug}`, { headers: { cookie: modCookie } })
  console.log('5б. модератор видит pending-кейс:', modView.status === 200 ? '✓ 200' : modView.status)

  // админка закрыта для посторонних
  const adminAsClient = await fetch(`${BASE}/admin`, { headers: { cookie: clientCookie } })
  console.log('6. /admin для клиента:', adminAsClient.status === 404 ? '✓ 404' : adminAsClient.status)
  const apiAsClient = await client('admin.approveCase', { caseId: 'whatever' })
  console.log('7. admin-API для клиента:', apiAsClient.status === 404 ? '✓ 404' : apiAsClient.status)

  // модератор одобряет кейс 1
  const caseId1 = psql(`SELECT id FROM \\"Case\\" WHERE slug='${c1.slug}'`)
  const approved = await mod('admin.approveCase', { caseId: caseId1 })
  console.log('8. одобрение:', approved.data?.ok ? '✓' : approved.error)
  const feedAfter = await (await fetch(`${BASE}/?type=deals`)).text()
  console.log('9. после одобрения кейс в ленте:', feedAfter.includes('кейс 1') ? '✓' : 'НЕТ')
  const again = await mod('admin.approveCase', { caseId: caseId1 })
  console.log('10. повторное одобрение:', again.status === 409 ? '✓ 409' : again.status)

  // кейс 2 отклоняется с причиной — автор видит её
  const c2 = await publishCase(specCookie, 'Смоук М5: кейс 2 с чужими фото')
  const caseId2 = psql(`SELECT id FROM \\"Case\\" WHERE slug='${c2.slug}'`)
  await mod('admin.rejectCase', { caseId: caseId2, reason: 'Фото не ваши — приложите собственные.' })
  const rejectedView = await (await fetch(`${BASE}/case/${c2.slug}`, { headers: { cookie: specCookie } })).text()
  console.log('11. автор видит отклонение с причиной:',
    rejectedView.includes('Кейс отклонён модерацией') && rejectedView.includes('Фото не ваши') ? '✓' : 'НЕТ')

  // после 3 одобрений — TRUSTED, дальше публикация мгновенная
  const c3 = await publishCase(specCookie, 'Смоук М5: кейс 3')
  const c4 = await publishCase(specCookie, 'Смоук М5: кейс 4')
  for (const slug of [c3.slug, c4.slug]) {
    const id = psql(`SELECT id FROM \\"Case\\" WHERE slug='${slug}'`)
    await mod('admin.approveCase', { caseId: id })
  }
  const tier = psql(`SELECT \\"trustTier\\" FROM \\"User\\" WHERE phone='+996700088031'`)
  console.log('12. после 3 одобрений автор TRUSTED:', tier === 'TRUSTED' ? '✓' : tier)
  const c5 = await publishCase(specCookie, 'Смоук М5: кейс 5 без очереди')
  console.log('13. пятый кейс публикуется мгновенно:', c5.pending === false ? '✓' : 'СНОВА ОЧЕРЕДЬ')

  // жалобы: гость без аккаунта (идентичность — HMAC от IP на сервере)
  const guestReport = await fetch(`${BASE}/api/trpc/reports.create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ json: { caseSlug: c5.slug, reason: 'contacts', comment: 'Телефон прямо в описании.' } }),
  })
  const first = await guestReport.json()
  console.log('14. гостевая жалоба принята:', guestReport.status === 200 && first?.result?.data?.json?.duplicate === false ? '✓' : guestReport.status)
  const dup = await (await fetch(`${BASE}/api/trpc/reports.create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ json: { caseSlug: c5.slug, reason: 'spam' } }),
  })).json()
  console.log('15. дубль гостевой жалобы (тот же IP):', dup?.result?.data?.json?.duplicate ? '✓ duplicate' : JSON.stringify(dup).slice(0, 80))

  // суточный лимит жалоб: тот же HMAC(ip), что вычисляет сервер
  // (Next сам синтезирует x-forwarded-for из сокета → 127.0.0.1)
  const anonId = createHmac('sha256', 'atelier-anon-dev').update('127.0.0.1').digest('hex').slice(0, 32)
  psql(`INSERT INTO \\"Report\\" (id, \\"reporterAnonId\\", \\"targetType\\", \\"targetId\\", reason, status, \\"createdAt\\", \\"updatedAt\\") SELECT 'smoke-rl-'||g, '${anonId}', 'CASE', '${caseId2}', 'SPAM', 'DISMISSED', now(), now() FROM generate_series(1,9) g`)
  const limited = await fetch(`${BASE}/api/trpc/reports.create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ json: { caseSlug: c1.slug, reason: 'spam' } }),
  })
  console.log('16. суточный лимит жалоб:', limited.status === 429 ? '✓ 429' : limited.status)

  // клиентская жалоба + скрытие модератором = страйк автору
  await client('reports.create', { caseSlug: c5.slug, reason: 'fake', comment: 'Цена не соответствует рынку, похоже на приманку.' })
  const reportId = psql(`SELECT id FROM \\"Report\\" WHERE \\"targetId\\"=(SELECT id FROM \\"Case\\" WHERE slug='${c5.slug}') AND \\"reporterId\\" IS NOT NULL AND status='OPEN' LIMIT 1`)
  const hidden = await mod('admin.resolveReport', { reportId, action: 'hide' })
  console.log('17. жалоба → контент скрыт:', hidden.data?.ok ? '✓' : hidden.error)
  const hiddenView = await fetch(`${BASE}/case/${c5.slug}`, { headers: { cookie: clientCookie } })
  const strikes1 = psql(`SELECT count(*) FROM \\"UserStrike\\" WHERE \\"userId\\"=(SELECT id FROM \\"User\\" WHERE phone='+996700088031')`)
  console.log('18. скрытый кейс недоступен, страйк записан:', hiddenView.status === 404 && strikes1 === '1' ? '✓' : `${hiddenView.status}/${strikes1}`)

  // отклонение жалобы не трогает контент
  const guestReportId = psql(`SELECT id FROM \\"Report\\" WHERE \\"reporterAnonId\\"='${anonId}' AND status='OPEN' LIMIT 1`)
  await mod('admin.resolveReport', { reportId: guestReportId, action: 'dismiss' })
  const c1View = await fetch(`${BASE}/case/${c1.slug}`)
  console.log('19. dismiss: кейс жив:', c1View.status === 200 ? '✓' : c1View.status)

  // 3 страйка = заморозка: домешиваем 2 страйка и скрываем ещё один кейс
  psql(`INSERT INTO \\"UserStrike\\" (id, \\"userId\\", \\"reasonCode\\", \\"createdAt\\") SELECT 'smoke-st-'||g, (SELECT id FROM \\"User\\" WHERE phone='+996700088031'), 'SMOKE', now() FROM generate_series(1,1) g`)
  await client('reports.create', { caseSlug: c3.slug, reason: 'offensive' })
  const reportId3 = psql(`SELECT id FROM \\"Report\\" WHERE \\"targetId\\"='${psql(`SELECT id FROM \\"Case\\" WHERE slug='${c3.slug}'`)}' AND status='OPEN' LIMIT 1`)
  await mod('admin.resolveReport', { reportId: reportId3, action: 'hide' })
  const frozen = psql(`SELECT \\"frozenAt\\" IS NOT NULL FROM \\"User\\" WHERE phone='+996700088031'`)
  console.log('20. 3 страйка → аккаунт заморожен:', frozen === 't' ? '✓' : frozen)
  const afterFreeze = await spec('cases.create', { kind: 'project', title: 'Кейс из заморозки', images: [], consent: true })
  console.log('21. замороженный не публикует:', afterFreeze.status === 403 ? `✓ 403 («${afterFreeze.error}»)` : afterFreeze.status)

  // журнал действий модератора пишется
  const audit = psql(`SELECT count(*) FROM \\"AuditLog\\" WHERE action IN ('case.approve','case.reject','report.hide_content','report.dismiss','user.freeze','user.promote_trusted')`)
  console.log('22. AuditLog заполнен:', Number(audit) >= 8 ? `✓ (${audit})` : audit)
}

try {
  await main()
} catch (e) {
  console.error(e)
  process.exit(1)
}
