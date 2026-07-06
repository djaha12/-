// Смоук M4 (петля доверия). Требует: сервер :3000 с OTP_DEV_MODE=1; чистые тест-номера +9967000880xx
// Запуск: node scripts/smoke-m4.mjs · очистка после: psql -f scripts/smoke-cleanup.sql
const BASE = 'http://127.0.0.1:3000'

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

const main = async () => {
  // роли: свежий риелтор и свежий клиент
  const specCookie = await login('+996700088002')
  const clientCookie = await login('+996700088001')
  const spec = api(specCookie)
  const client = api(clientCookie)
  console.log('1. вход риелтора и клиента: ✓')

  // риелтор публикует кейс-сделку
  const form = new FormData()
  form.append('file', new Blob([png], { type: 'image/png' }), 's.png')
  const up = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form, headers: { cookie: specCookie } })
  const img = await up.json()
  const created = await spec('cases.create', {
    kind: 'deal', title: 'Смоук М4: студия на Юнусалиева', images: [img],
    districtName: 'Асанбай', consent: true, dealType: 'sale', propertyType: 'Вторичка',
    price: 3900000, priceVisibility: 'range', daysOnMarket: 14,
  })
  const caseSlug = created.data.slug
  const caseHtml = await (await fetch(`${BASE}/case/${caseSlug}`)).text()
  const specSlug = caseHtml.match(/\/s\/(s-[a-z0-9]+)/)?.[1]
  console.log('2. кейс-сделка опубликована:', caseSlug, '· профиль:', specSlug)
  console.log('3. бейджа на кейсе ещё нет:', caseHtml.includes('подтверждена клиентом') ? 'ЕСТЬ (рано!)' : '✓')

  // клиент отправляет заявку с кейса
  const lead = await client('leads.create', {
    specialistSlug: specSlug, caseSlug,
    text: 'Здравствуйте! Хочу продать похожую студию в этом же районе. Поможете?',
  })
  const threadId = lead.data.threadId
  console.log('4. заявка → тред:', threadId ? '✓' : lead.error)

  // чат: специалист видит и отвечает
  const seen = await spec('chat.messages', { threadId }, 'query')
  await spec('chat.send', { threadId, text: 'Добрый день! Да, посмотрю завтра. Отправляю условия.' })
  console.log('5. чат работает:', seen.data.length === 1 ? '✓ (заявка видна специалисту)' : 'НЕТ')

  // чужой не может читать тред
  const stranger = api(await login('+996700088003'))
  const spy = await stranger('chat.messages', { threadId }, 'query')
  console.log('6. чужому тред недоступен:', spy.status === 404 ? '✓ 404' : 'УТЕЧКА ' + spy.status)

  // заказ: клиент предложить НЕ может, специалист — может
  const wrong = await client('orders.propose', { threadId, title: 'Продажа студии' })
  console.log('7. клиент не предлагает заказ:', wrong.status === 403 ? '✓ 403' : wrong.status)
  const proposed = await spec('orders.propose', { threadId, title: 'Продажа студии на Юнусалиева', amountMin: 3800000, amountMax: 4000000 })
  const orderId = proposed.data.orderId
  console.log('8. заказ предложен: ✓')

  // фейковый путь discussion→completed закрыт
  const fake = await client('orders.transition', { orderId, to: 'completed' })
  console.log('9. discussion→completed закрыт:', fake.status === 403 ? '✓ 403' : fake.status)

  // честный путь
  await client('orders.transition', { orderId, to: 'agreed' })
  await spec('orders.transition', { orderId, to: 'in_progress' })
  await spec('orders.transition', { orderId, to: 'delivered' })
  const done = await client('orders.transition', { orderId, to: 'completed' })
  console.log('10. agreed→in_progress→delivered→completed:', done.data?.state === 'completed' ? '✓' : done.error)

  // отзыв: специалист о себе не может, клиент — может, второй раз — нет
  const selfReview = await spec('reviews.create', { orderId, quality: 5, timing: 5, communication: 5, budget: 5, text: 'Сам себя хвалю от души!' })
  console.log('11. отзыв не-клиентом отклонён:', selfReview.status === 400 ? `✓ («${selfReview.error}»)` : selfReview.status)
  const review = await client('reviews.create', { orderId, quality: 5, timing: 5, communication: 5, budget: 4, text: 'Продали за две недели, все шаги были видны в заказе. Рекомендую!' })
  console.log('12. отзыв клиента принят:', review.data?.ok ? '✓' : review.error)
  const dup = await client('reviews.create', { orderId, quality: 5, timing: 5, communication: 5, budget: 5, text: 'Ещё раз спасибо огромное!' })
  console.log('13. повторный отзыв отклонён:', dup.status === 400 ? `✓ («${dup.error}»)` : dup.status)

  // бейдж: привязка кейса к завершённому заказу
  const forThread = await spec('orders.forThread', { threadId }, 'query')
  const linkable = forThread.data.linkableCases.map((c) => c.slug)
  console.log('14. кейс доступен для привязки:', linkable.includes(caseSlug) ? '✓' : 'НЕТ')
  const linked = await spec('orders.linkCase', { orderId, caseSlug })
  console.log('15. привязка:', linked.data?.confirmed ? '✓' : linked.error)
  const after = await (await fetch(`${BASE}/case/${caseSlug}`)).text()
  console.log('16. бейдж «Сделка подтверждена клиентом» на кейсе:', after.includes('подтверждена клиентом') ? '✓' : 'НЕТ')

  // витрина специалиста выросла честно
  const profHtml = (await (await fetch(`${BASE}/s/${specSlug}`)).text()).replace(/ |&nbsp;/g, ' ')
  console.log('17. профиль: 1 отзыв в витрине:', /1 отзыв/.test(profHtml) ? '✓' : '?', '· подтверждена клиентами:', /1 подтверждена/.test(profHtml) ? '✓' : '?')

  // повторная привязка того же кейса закрыта
  const relink = await spec('orders.linkCase', { orderId, caseSlug })
  console.log('18. повторная привязка отклонена:', relink.status === 400 ? '✓' : relink.status)
}

// регрессии code-review M4
async function extra() {
  const specCookie = await login('+996700088002')
  const clientCookie = await login('+996700088001')
  const spec = api(specCookie)
  const client = api(clientCookie)

  // 19. специалист НЕ может сам «договориться» (взаимность)
  const lead2 = await client('leads.create', { specialistSlug: (await (async()=>{const f=new FormData();f.append('file',new Blob([png],{type:'image/png'}),'x.png');const up=await fetch(BASE+'/api/upload',{method:'POST',body:f,headers:{cookie:specCookie}});const img=await up.json();const c=await spec('cases.create',{kind:'deal',title:'Смоук М4-2: комната на Раззакова',images:[img],districtName:'Центр',consent:true,dealType:'sale',propertyType:'Вторичка',price:2500000,priceVisibility:'range',daysOnMarket:9});global.case2=c.data.slug;const html=await(await fetch(BASE+'/case/'+c.data.slug)).text();return html.match(/\/s\/(s-[a-z0-9]+)/)[1]})()), caseSlug: global.case2, text: 'Вторая заявка — продаю комнату на Раззакова.' })
  const threadId = lead2.data.threadId
  const p = await spec('orders.propose', { threadId, title: 'Продажа комнаты' })
  const selfAgree = await spec('orders.transition', { orderId: p.data.orderId, to: 'agreed' })
  console.log('19. специалист сам agreed:', selfAgree.status === 403 ? `✓ 403 («${selfAgree.error}»)` : selfAgree.status)

  // честно доводим до completed
  await client('orders.transition', { orderId: p.data.orderId, to: 'agreed' })
  await spec('orders.transition', { orderId: p.data.orderId, to: 'in_progress' })
  await spec('orders.transition', { orderId: p.data.orderId, to: 'delivered' })
  await client('orders.transition', { orderId: p.data.orderId, to: 'completed' })

  // 20. один заказ — один бейдж: первый кейс уже подтверждён другим заказом,
  // подтверждаем ЭТИМ заказом кейс №2, затем пытаемся им же... нужен третий кейс
  const f3 = new FormData(); f3.append('file', new Blob([png],{type:'image/png'}),'y.png')
  const up3 = await fetch(BASE+'/api/upload',{method:'POST',body:f3,headers:{cookie:specCookie}})
  const img3 = await up3.json()
  const c3 = await spec('cases.create',{kind:'deal',title:'Смоук М4-3: паркинг',images:[img3],districtName:'Центр',consent:true,dealType:'sale',propertyType:'Коммерция',price:900000,priceVisibility:'range',daysOnMarket:30})
  const ok1 = await spec('orders.linkCase', { orderId: p.data.orderId, caseSlug: global.case2 })
  const dup = await spec('orders.linkCase', { orderId: p.data.orderId, caseSlug: c3.data.slug })
  console.log('20. первый кейс подтверждён:', ok1.data?.confirmed ? '✓' : ok1.error)
  console.log('21. тот же заказ на второй кейс:', dup.status === 400 ? `✓ 400 («${dup.error}»)` : dup.status)
}

try {
  await main()
  await extra()
} catch (e) {
  console.error(e)
  process.exit(1)
}
