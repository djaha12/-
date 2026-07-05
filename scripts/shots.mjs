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

const ROUTES = [
  { name: 'feed', path: '/' },
  { name: 'profile', path: '/s/aizhan-saparova' },
  { name: 'profile-reviews', path: '/s/aizhan-saparova?tab=reviews' },
  { name: 'case', path: '/case/loft-dzhal-72' },
  { name: 'profile-realtor', path: '/s/nurlan-abdykadyrov' },
  { name: 'case-deal', path: '/case/dvushka-toktogula' },
  { name: 'dev-ui', path: '/dev/ui' },
]

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
  console.log('Запускаю next start…')
  server = spawn('pnpm', ['--filter', '@atelier/web', 'start'], {
    cwd: root,
    stdio: 'ignore',
    detached: true,
  })
}

try {
  await waitForServer(BASE)
  mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch({ executablePath: findChromium() })
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ deviceScaleFactor: 1 })
    await ctx.addInitScript((t) => localStorage.setItem('theme', t), theme)
    for (const vp of VIEWPORTS) {
      const page = await ctx.newPage()
      await page.setViewportSize({ width: vp.width, height: vp.height })
      for (const route of ROUTES) {
        await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(400) // дождаться шрифтов/анимаций

        // фиксированные бары в fullPage рисуются посреди страницы — прячем их,
        // а их реальное положение фиксируем отдельным кадром первого экрана
        const hasBar = await page.evaluate(() => {
          const bars = document.querySelectorAll('[data-fixed-bar]')
          for (const b of bars) b.style.visibility = 'hidden'
          return bars.length > 0 && getComputedStyle(bars[0]).display !== 'none'
        })
        const file = path.join(OUT, `${route.name}--${vp.name}--${theme}.png`)
        await page.screenshot({ path: file, fullPage: true })
        console.log(`✓ ${path.basename(file)}`)

        if (hasBar) {
          await page.evaluate(() => {
            for (const b of document.querySelectorAll('[data-fixed-bar]')) b.style.visibility = ''
          })
          const vpFile = path.join(OUT, `${route.name}--${vp.name}--${theme}--viewport.png`)
          await page.screenshot({ path: vpFile })
          console.log(`✓ ${path.basename(vpFile)}`)
        }
      }
      await page.close()
    }
    await ctx.close()
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
