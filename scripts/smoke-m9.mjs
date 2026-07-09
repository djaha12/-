// Смоук M9 (M6.2): онбординг специалиста — самозапись, районы, входные гейты.
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

let pass = 0, fail = 0
const check = (n, ok, got) => { console.log(`${n}:`, ok ? '✓' : `✗ (${got})`); ok ? pass++ : fail++ }

const main = async () => {
  const PHONE = '+996700088061'
  const cookie = await login(PHONE)
  const me = api(cookie)
  check('1. вход нового пользователя', Boolean(cookie), 'нет cookie')

  // гейты входа
  const guest = await fetch(`${BASE}/onboarding`, { redirect: 'follow' })
  check('2. /onboarding гостю → логин с next', guest.url.includes('/login') && guest.url.includes('next='), guest.url)
  const newPage = await fetch(`${BASE}/new`, { headers: { cookie }, redirect: 'follow' })
  check('3. /new без профиля → онбординг', newPage.url.includes('/onboarding'), newPage.url)

  // сверх лимита районов — отказ из core
  const allSlugs = psql(`SELECT string_agg(slug, ',') FROM \\"District\\"`).split(',')
  const over = await me('profiles.setup', {
    displayName: 'Смоук Риелтор',
    specialization: 'REALTOR',
    districtSlugs: allSlugs.slice(0, 6),
  })
  check('4. 6 районов отклонены', over.status === 400, `${over.status} ${over.error ?? ''}`)

  // самозапись: профиль + районы
  const setup = await me('profiles.setup', {
    displayName: 'Смоук Риелтор',
    specialization: 'REALTOR',
    worksAt: 'Ак-Үй',
    districtSlugs: allSlugs.slice(0, 2),
  })
  check('5. онбординг создал профиль', setup.status === 200 && setup.data.slug?.startsWith('s-'), setup.error ?? setup.status)
  const slug = setup.data.slug
  const role = psql(`SELECT role FROM \\"User\\" WHERE phone='${PHONE}'`)
  check('6. роль повышена до SPECIALIST', role === 'SPECIALIST', role)
  const districts = Number(psql(`SELECT count(*) FROM \\"SpecialistDistrict\\" sd JOIN \\"SpecialistProfile\\" sp ON sp.id=sd.\\"specialistProfileId\\" WHERE sp.slug='${slug}'`))
  check('7. районы сохранены (2)', districts === 2, districts)

  // событие аналитики
  const evt = Number(psql(`SELECT count(*) FROM \\"AnalyticsOutbox\\" WHERE \\"eventName\\"='onboarding_completed' AND \\"actorId\\"=(SELECT id FROM \\"User\\" WHERE phone='${PHONE}')`))
  check('8. onboarding_completed в outbox', evt === 1, evt)

  // каталог фильтруется по заявленному району (без единого кейса)
  const dSlug = allSlugs[0]
  const catalog = await (await fetch(`${BASE}/specialists?district=${dSlug}`)).text()
  check('9. новичок виден в каталоге своего района', catalog.includes('Смоук Риелтор'), 'не найден')

  // профиль: «работает в …» и кнопка настройки владельцу
  const profileHtml = await (await fetch(`${BASE}/s/${slug}`, { headers: { cookie } })).text()
  check('10. метка «работает в Ак-Үй» на профиле', profileHtml.includes('Ак-Үй'), 'нет метки')
  check('11. владельцу — «Настроить профиль»', profileHtml.includes('Настроить профиль'), 'нет кнопки')

  // повторный setup = редактирование (полная замена районов, слаг тот же)
  const edit = await me('profiles.setup', {
    displayName: 'Смоук Риелтор',
    specialization: 'REALTOR',
    districtSlugs: allSlugs.slice(2, 3),
  })
  const districts2 = Number(psql(`SELECT count(*) FROM \\"SpecialistDistrict\\" sd JOIN \\"SpecialistProfile\\" sp ON sp.id=sd.\\"specialistProfileId\\" WHERE sp.slug='${slug}'`))
  check('12. редактирование заменяет районы (1) и хранит слаг', edit.data?.slug === slug && districts2 === 1, `${edit.data?.slug} / ${districts2}`)

  // /new с профилем открывается (без редиректа на онбординг)
  const newPage2 = await fetch(`${BASE}/new`, { headers: { cookie }, redirect: 'follow' })
  check('13. /new с профилем открывается', !newPage2.url.includes('/onboarding') && newPage2.status === 200, newPage2.url)

  // контакт-детект на записи: телефон в публичной метке → 400 (телефоны до заявки)
  const contact = await me('profiles.setup', {
    displayName: 'Смоук Риелтор',
    specialization: 'REALTOR',
    worksAt: 'звоните +996 555 123 456',
    districtSlugs: [],
  })
  check('14. телефон в «работаю в X» отклонён', contact.status === 400, `${contact.status} ${contact.error ?? ''}`)

  console.log(`\n${pass}/${pass + fail} проверок пройдено`)
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
