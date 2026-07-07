// Скриншот-харнесс: доказательства для каждого экрана (ТЗ).
// 1440px и 390px × light/dark по списку маршрутов → screenshots/
// Использует предустановленный Chromium (PLAYWRIGHT_BROWSERS_PATH или /opt/pw-browsers).
import { chromium } from 'playwright-core'
import { globSync } from 'node:fs'
import { mkdirSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT = path.join(root, 'screenshots')
const BASE = process.env.SHOTS_BASE_URL ?? 'http://127.0.0.1:3000'

const CLIENT_PHONE = '+996700010004' // Гульмира А. (сид)
const SPEC_PHONE = '+996700000012' // Нурлан Абдыкадыров (сид)
const MOD_PHONE = '+996700000099' // Модерация Ателье (сид)

const ROUTES = [
  { name: 'feed', path: '/' },
  { name: 'profile', path: '/s/aizhan-saparova' },
  { name: 'profile-reviews', path: '/s/aizhan-saparova?tab=reviews' },
  { name: 'case', path: '/case/loft-dzhal-72' },
  { name: 'profile-realtor', path: '/s/nurlan-abdykadyrov' },
  { name: 'case-deal', path: '/case/dvushka-toktogula' },
  { name: 'specialists', path: '/specialists' },
  { name: 'wizard-1', path: '/new' },
  { name: 'wizard-2', path: '/new?step=2' },
  { name: 'wizard-3', path: '/new?step=3' },
  { name: 'login', path: '/login' },
  { name: 'login-otp', path: '/login?step=2' },
  // M4: экраны под сессией клиента (Гульмира из сида)
  { name: 'contact', path: '/contact/nurlan-abdykadyrov', auth: true },
  { name: 'messages', path: '/messages', auth: true },
  { name: 'thread', path: '__FIRST_THREAD__', auth: true },
  // M4.5: брифы — обе роли (spec: сессия Нурлана)
  { name: 'briefs-my', path: '/briefs', auth: true },
  { name: 'brief-new', path: '/briefs/new', auth: true },
  { name: 'brief-owner', path: '__BRIEF_OWNER__', auth: true },
  { name: 'briefs-feed', path: '/briefs', auth: 'spec' },
  { name: 'brief-respond', path: '__BRIEF_RESPOND__', auth: 'spec' },
  // M5: очередь модерации (сессия модератора)
  { name: 'admin', path: '/admin', auth: 'mod' },
  // M7: дашборд владельца
  { name: 'admin-stats', path: '/admin/stats', auth: 'mod' },
  // M6: уведомления и тарифы
  { name: 'notifications', path: '/notifications', auth: true },
  { name: 'settings-notifications', path: '/settings/notifications', auth: 'spec' },
  { name: 'pro', path: '/pro', auth: 'spec' },
  { name: 'dev-ui', path: '/dev/ui' },
]

/** вход тестовым номером сида через OTP-API; возвращает cookie-значение сессии */
async function loginTestUser(base, phone) {
  const call = async (path, input) => {
    const res = await fetch(`${base}/api/trpc/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ json: input }),
    })
    return { body: await res.json(), setCookie: res.headers.get('set-cookie') }
  }
  const r1 = await call('auth.requestOtp', { phone })
  const code = r1.body?.result?.data?.json?.devCode
  if (!code) throw new Error('OTP_DEV_MODE выключен — не могу залогиниться для скриншотов')
  const r2 = await call('auth.verifyOtp', { phone, code })
  const m = r2.setCookie?.match(/atelier_session=([^;]+)/)
  if (!m) throw new Error('Сессия не установилась')
  return m[1]
}

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
]

function findChromium() {
  const envPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  const candidates = globSync(path.join(envPath, 'chromium-*/chrome-linux/chrome'))
  if (candidates.length > 0) return candidates.sort().at(-1)
  throw new Error(`Chromium не найден в ${envPath}`)
}

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Сервер не поднялся: ${url}`)
}

let server
if (!process.env.SHOTS_BASE_URL) {
  // страницы читают из БД — поднимаем dev-Postgres и сеем при первом запуске
  const { startDb } = await import('./dev-db.mjs')
  process.env.DATABASE_URL = startDb()
  const { execSync } = await import('node:child_process')
  execSync('pnpm --filter @atelier/db seed', { cwd: root, stdio: 'inherit' })
  // повторные прогоны упираются в наш же rate limit OTP — чистим коды тест-номеров
  execSync(
    `/usr/lib/postgresql/16/bin/psql -h localhost -p 5433 -U atelier -d atelier -c "DELETE FROM \\"OtpCode\\" WHERE phone IN ('+996700010004', '+996700000012', '+996700000099')"`,
    { stdio: 'ignore' },
  )

  console.log('Запускаю next start…')
  server = spawn('pnpm', ['--filter', '@atelier/web', 'start'], {
    cwd: root,
    stdio: 'ignore',
    detached: true,
    env: {
      ...process.env,
      OTP_DEV_MODE: '1',
      NEXT_PUBLIC_TELEGRAM_BOT: 'atelier_demo_bot',
      TELEGRAM_WEBHOOK_SECRET: 'shots-tg',
    },
  })
}

try {
  await waitForServer(BASE)
  mkdirSync(OUT, { recursive: true })

  // сессии трёх ролей + динамические id для авторизованных маршрутов
  const sessionToken = await loginTestUser(BASE, CLIENT_PHONE)
  const specToken = await loginTestUser(BASE, SPEC_PHONE)
  const modToken = await loginTestUser(BASE, MOD_PHONE)
  const fetchAs = (token, path) =>
    fetch(`${BASE}${path}`, { headers: { cookie: `atelier_session=${token}` } }).then((r) => r.text())

  const messagesHtml = await fetchAs(sessionToken, '/messages')
  // cuid-треда (не спутать с путями чанков вида /messages/page-*.js)
  const firstThread = messagesHtml.match(/\/messages\/(c[a-z0-9]{20,})/)?.[1]
  // бриф Гульмиры с откликами (первый в «моих») и свежий бриф в ленте специалиста
  const briefOwner = (await fetchAs(sessionToken, '/briefs')).match(/\/briefs\/(c[a-z0-9]{20,})/)?.[1]
  const briefRespond = (await fetchAs(specToken, '/briefs')).match(/\/briefs\/(c[a-z0-9]{20,})/)?.[1]

  const DYNAMIC = {
    __FIRST_THREAD__: firstThread ? `/messages/${firstThread}` : null,
    __BRIEF_OWNER__: briefOwner ? `/briefs/${briefOwner}` : null,
    __BRIEF_RESPOND__: briefRespond ? `/briefs/${briefRespond}` : null,
  }

  const browser = await chromium.launch({ executablePath: findChromium() })
  for (const theme of ['light', 'dark']) {
    const mkContext = async (token) => {
      const c = await browser.newContext({ deviceScaleFactor: 1 })
      await c.addInitScript((t) => localStorage.setItem('theme', t), theme)
      await c.addCookies([
        { name: 'atelier_session', value: token, url: BASE, httpOnly: true, sameSite: 'Lax' },
      ])
      return c
    }
    const ctx = await mkContext(sessionToken)
    const specCtx = await mkContext(specToken)
    const modCtx = await mkContext(modToken)
    for (const vp of VIEWPORTS) {
      const page = await ctx.newPage()
      await page.setViewportSize({ width: vp.width, height: vp.height })
      const specPage = await specCtx.newPage()
      await specPage.setViewportSize({ width: vp.width, height: vp.height })
      const modPage = await modCtx.newPage()
      await modPage.setViewportSize({ width: vp.width, height: vp.height })
      for (const route of ROUTES) {
        const routePath = route.path in DYNAMIC ? DYNAMIC[route.path] : route.path
        if (!routePath) continue
        const p = route.auth === 'spec' ? specPage : route.auth === 'mod' ? modPage : page
        // networkidle хрупок на динамических страницах (префетчи) — load + пауза стабильнее
        await p.goto(`${BASE}${routePath}`, { waitUntil: 'load', timeout: 60000 })
        await p.waitForTimeout(900) // шрифты, изображения, анимации

        // фиксированные бары в fullPage рисуются посреди страницы — прячем их,
        // а их реальное положение фиксируем отдельным кадром первого экрана
        const hasBar = await p.evaluate(() => {
          const bars = document.querySelectorAll('[data-fixed-bar]')
          for (const b of bars) b.style.visibility = 'hidden'
          return bars.length > 0 && getComputedStyle(bars[0]).display !== 'none'
        })
        const file = path.join(OUT, `${route.name}--${vp.name}--${theme}.png`)
        await p.screenshot({ path: file, fullPage: true })
        console.log(`✓ ${path.basename(file)}`)

        if (hasBar) {
          await p.evaluate(() => {
            for (const b of document.querySelectorAll('[data-fixed-bar]')) b.style.visibility = ''
          })
          const vpFile = path.join(OUT, `${route.name}--${vp.name}--${theme}--viewport.png`)
          await p.screenshot({ path: vpFile })
          console.log(`✓ ${path.basename(vpFile)}`)
        }
      }
      await page.close()
      await specPage.close()
      await modPage.close()
    }
    await ctx.close()
    await specCtx.close()
    await modCtx.close()
  }
  await browser.close()
  console.log(`\nГотово → ${OUT}`)
} finally {
  if (server?.pid) {
    try {
      process.kill(-server.pid)
    } catch {}
  }
}
