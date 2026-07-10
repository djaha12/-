// Смоук M11: web-push (подписки, VAPID-ключ) + cron-дайджест непрочитанного.
// Требует сервер :3000 с OTP_DEV_MODE=1, CRON_SECRET=smoke-cron и VAPID_*-ключами
// (тестовая пара в scripts/README запуска). Очистка: psql -f scripts/smoke-cleanup.sql
import { execSync } from 'node:child_process'

const BASE = 'http://127.0.0.1:3000'
const PSQL = `/usr/lib/postgresql/16/bin/psql -h localhost -p 5433 -U atelier -d atelier -tAc`
const psql = (q) => execSync(`${PSQL} "${q}"`).toString().trim()

const api = (cookie) => async (path, input, method = 'mutation') => {
  const url =
    method === 'query'
      ? `${BASE}/api/trpc/${path}${input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`}`
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

const digest = (auth) =>
  fetch(`${BASE}/api/cron/digest`, {
    method: 'POST',
    headers: auth ? { authorization: `Bearer ${auth}` } : {},
  })

let pass = 0, fail = 0
const check = (n, ok, got) => { console.log(`${n}:`, ok ? '✓' : `✗ (${got})`); ok ? pass++ : fail++ }

const main = async () => {
  const A_PHONE = '+996700088064'
  const B_PHONE = '+996700088065'
  const cookieA = await login(A_PHONE)
  const cookieB = await login(B_PHONE)
  const a = api(cookieA)
  const b = api(cookieB)
  const anon = api()
  const uid = (phone) => psql(`SELECT id FROM \\"User\\" WHERE phone='${phone}'`)
  const A = uid(A_PHONE)
  const B = uid(B_PHONE)

  // канал настроен: публичный ключ отдаётся
  const key = await anon('notifications.pushKey', undefined, 'query')
  check('1. pushKey отдаёт VAPID-ключ', typeof key.data?.key === 'string' && key.data.key.length > 20, JSON.stringify(key.data))

  // подписки
  const guest = await anon('notifications.subscribePush', { endpoint: 'https://push.example/smoke-1', p256dh: 'k', auth: 'a' })
  check('2. подписка гостю → 401', guest.status === 401, guest.status)
  const insecure = await a('notifications.subscribePush', { endpoint: 'http://push.example/smoke-1', p256dh: 'k', auth: 'a' })
  check('3. http-endpoint отклонён', insecure.status === 400, insecure.status)

  const EP = 'https://push.example/smoke-m11'
  const sub = await a('notifications.subscribePush', { endpoint: EP, p256dh: 'pk', auth: 'au', userAgent: 'smoke' })
  const owner1 = psql(`SELECT \\"userId\\" FROM \\"PushSubscription\\" WHERE endpoint='${EP}'`)
  check('4. подписка сохранена за A', sub.status === 200 && owner1 === A, `${sub.status} ${owner1}`)

  const resub = await b('notifications.subscribePush', { endpoint: EP, p256dh: 'pk2', auth: 'au2' })
  const owner2 = psql(`SELECT \\"userId\\" FROM \\"PushSubscription\\" WHERE endpoint='${EP}'`)
  const cnt = Number(psql(`SELECT count(*) FROM \\"PushSubscription\\" WHERE endpoint='${EP}'`))
  check('5. повторная подписка переприсваивает браузер B', resub.status === 200 && owner2 === B && cnt === 1, `${owner2} n=${cnt}`)

  await a('notifications.unsubscribePush', { endpoint: EP })
  const stillThere = Number(psql(`SELECT count(*) FROM \\"PushSubscription\\" WHERE endpoint='${EP}'`))
  check('6. чужая отписка не удаляет', stillThere === 1, stillThere)
  await b('notifications.unsubscribePush', { endpoint: EP })
  const gone = Number(psql(`SELECT count(*) FROM \\"PushSubscription\\" WHERE endpoint='${EP}'`))
  check('7. отписка владельцем удаляет', gone === 0, gone)

  // дайджест: авторизация
  const noAuth = await digest()
  check('8. дайджест без Bearer → 401', noAuth.status === 401, noAuth.status)

  // дайджест: unread-уведомление у A с push-каналом (fake endpoint — доставка упадёт)
  await a('notifications.subscribePush', { endpoint: 'https://push.example/smoke-a', p256dh: 'pk', auth: 'au' })
  psql(`INSERT INTO \\"Notification\\" (id, \\"userId\\", type, title, \\"createdAt\\", \\"updatedAt\\") VALUES ('smoke-m11-n1', '${A}', 'lead_new', 'Смоук: заявка', now(), now())`)
  const d1 = await (await digest('smoke-cron')).json()
  const lastDigest = psql(`SELECT \\"lastDigestAt\\" FROM \\"User\\" WHERE id='${A}'`)
  check('9. кандидат посчитан, недоставленное не отмечено', d1.candidates >= 1 && lastDigest === '', `${JSON.stringify(d1)} last=${lastDigest}`)

  // после прочтения уведомления кандидатов из уведомлений нет
  psql(`UPDATE \\"Notification\\" SET \\"readAt\\"=now() WHERE id='smoke-m11-n1'`)
  const d2 = await (await digest('smoke-cron')).json()
  check('10. прочитанное не будит дайджест', d2.candidates === 0, JSON.stringify(d2))

  // непрочитанное сообщение чата тоже собирается
  psql(`INSERT INTO \\"ChatThread\\" (id, \\"createdAt\\", \\"updatedAt\\") VALUES ('smoke-m11-t1', now(), now())`)
  psql(`INSERT INTO \\"ChatParticipant\\" (id, \\"threadId\\", \\"userId\\", \\"createdAt\\", \\"updatedAt\\") VALUES ('smoke-m11-p1', 'smoke-m11-t1', '${A}', now(), now()), ('smoke-m11-p2', 'smoke-m11-t1', '${B}', now(), now())`)
  psql(`INSERT INTO \\"Message\\" (id, \\"threadId\\", \\"senderId\\", kind, text, \\"createdAt\\", \\"updatedAt\\") VALUES ('smoke-m11-m1', 'smoke-m11-t1', '${B}', 'TEXT', 'смоук', now(), now())`)
  const d3 = await (await digest('smoke-cron')).json()
  check('11. непрочитанное сообщение чата будит дайджест', d3.candidates >= 1, JSON.stringify(d3))

  // прочитал тред → тишина
  psql(`UPDATE \\"ChatParticipant\\" SET \\"lastReadAt\\"=now() WHERE id='smoke-m11-p1'`)
  const d4 = await (await digest('smoke-cron')).json()
  check('12. прочитанный чат — тишина', d4.candidates === 0, JSON.stringify(d4))

  // артефакты смоука вне cleanup-паттернов — подчистим сразу
  psql(`DELETE FROM \\"Message\\" WHERE id='smoke-m11-m1'`)
  psql(`DELETE FROM \\"ChatParticipant\\" WHERE id IN ('smoke-m11-p1','smoke-m11-p2')`)
  psql(`DELETE FROM \\"ChatThread\\" WHERE id='smoke-m11-t1'`)
  psql(`DELETE FROM \\"Notification\\" WHERE id='smoke-m11-n1'`)

  console.log(`\n${pass}/${pass + fail} проверок пройдено`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
