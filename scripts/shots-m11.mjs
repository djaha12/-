// Ad-hoc: скриншоты M11 — настройки уведомлений с push-секцией (ru/ky).
// Требует сервер :3000 с OTP_DEV_MODE=1 и VAPID_*.
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
  { name: 'm11-settings-ru--390', path: '/settings/notifications', locale: null, w: 390, h: 844 },
  { name: 'm11-settings-ky--390', path: '/settings/notifications', locale: 'ky', w: 390, h: 844 },
  { name: 'm11-settings-ru--1440', path: '/settings/notifications', locale: null, w: 1440, h: 900 },
]

const chrome = globSync(
  path.join(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers', 'chromium-*/chrome-linux/chrome'),
)
  .sort()
  .at(-1)

const spec = await loginTestUser('+996700000012')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: chrome })
for (const theme of ['light', 'dark']) {
  for (const s of SHOTS) {
    const ctx = await browser.newContext({ deviceScaleFactor: 1 })
    await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme)
    const cookies = [
      { name: 'atelier_session', value: spec, url: BASE, httpOnly: true, sameSite: 'Lax' },
    ]
    if (s.locale) cookies.push({ name: 'atelier_locale', value: s.locale, url: BASE })
    await ctx.addCookies(cookies)
    const page = await ctx.newPage()
    await page.setViewportSize({ width: s.w, height: s.h })
    await page.goto(`${BASE}${s.path}`, { waitUntil: 'load', timeout: 60000 })
    await page.waitForTimeout(900)
    await page.screenshot({ path: path.join(OUT, `${s.name}--${theme}.png`), fullPage: true })
    console.log(`✓ ${s.name}--${theme}.png`)
    await ctx.close()
  }
}
await browser.close()
