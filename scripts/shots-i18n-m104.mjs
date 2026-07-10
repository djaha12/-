// Ad-hoc: i18n-скриншоты M10.4 — профиль + мастера на ky/en.
// Требует сервер :3000 (сид) с OTP_DEV_MODE=1.
import { chromium } from 'playwright-core'
import { globSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT = path.join(root, 'screenshots')
const BASE = 'http://127.0.0.1:3000'

async function loginTestUser(phone) {
  const call = async (p, input) => {
    const res = await fetch(`${BASE}/api/trpc/${p}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ json: input }),
    })
    return { body: await res.json(), setCookie: res.headers.get('set-cookie') }
  }
  const r1 = await call('auth.requestOtp', { phone })
  const code = r1.body?.result?.data?.json?.devCode
  if (!code) throw new Error(`нет devCode: ${JSON.stringify(r1.body)}`)
  const r2 = await call('auth.verifyOtp', { phone, code })
  return r2.setCookie?.match(/atelier_session=([^;]+)/)?.[1]
}

const SHOTS = [
  // профиль риелтора — гость
  { name: 'i18n-profile-ky--390', path: '/s/nurlan-abdykadyrov', locale: 'ky', w: 390, h: 844 },
  { name: 'i18n-profile-ky--1440', path: '/s/nurlan-abdykadyrov', locale: 'ky', w: 1440, h: 900 },
  { name: 'i18n-profile-en--390', path: '/s/nurlan-abdykadyrov', locale: 'en', w: 390, h: 844 },
  // мастера — специалист из сида
  { name: 'i18n-wizard2-ky--390', path: '/new?step=2', locale: 'ky', w: 390, h: 844, auth: 'spec' },
  { name: 'i18n-wizard3-ky--390', path: '/new?step=3', locale: 'ky', w: 390, h: 844, auth: 'spec' },
  { name: 'i18n-wizard2-en--390', path: '/new?step=2', locale: 'en', w: 390, h: 844, auth: 'spec' },
  // онбординг — новый пользователь (режим создания)
  { name: 'i18n-onboarding-ky--390', path: '/onboarding', locale: 'ky', w: 390, h: 844, auth: 'new' },
]

const chrome = globSync(
  path.join(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers', 'chromium-*/chrome-linux/chrome'),
)
  .sort()
  .at(-1)

const spec = await loginTestUser('+996700000012')
const fresh = await loginTestUser('+996700088063')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: chrome })
for (const s of SHOTS) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1 })
  await ctx.addInitScript(() => localStorage.setItem('theme', 'light'))
  const cookies = [{ name: 'atelier_locale', value: s.locale, url: BASE }]
  if (s.auth === 'spec')
    cookies.push({ name: 'atelier_session', value: spec, url: BASE, httpOnly: true, sameSite: 'Lax' })
  if (s.auth === 'new')
    cookies.push({ name: 'atelier_session', value: fresh, url: BASE, httpOnly: true, sameSite: 'Lax' })
  await ctx.addCookies(cookies)
  const page = await ctx.newPage()
  await page.setViewportSize({ width: s.w, height: s.h })
  await page.goto(`${BASE}${s.path}`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(900)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('[data-fixed-bar]')) b.style.visibility = 'hidden'
  })
  await page.screenshot({ path: path.join(OUT, `${s.name}--light.png`), fullPage: true })
  console.log(`✓ ${s.name}--light.png`)
  await ctx.close()
}
await browser.close()
