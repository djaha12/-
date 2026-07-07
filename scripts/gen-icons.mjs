// Иконки PWA: терракотовый квадрат с серифной «А» (бренд-минимум без внешних ресурсов).
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PUBLIC = path.join(root, 'apps/web/public')
const APP = path.join(root, 'apps/web/src/app')
mkdirSync(PUBLIC, { recursive: true })

const svg = (radius) => `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="${radius}" fill="#b0603f"/>
  <text x="256" y="352" font-family="Georgia, 'Times New Roman', serif" font-size="300"
        font-weight="700" fill="#f8f5f0" text-anchor="middle">А</text>
</svg>`

for (const [file, size, radius] of [
  [path.join(PUBLIC, 'icon-192.png'), 192, 96],
  [path.join(PUBLIC, 'icon-512.png'), 512, 112],
  // maskable: full-bleed без скруглений — маску накладывает ОС, прозрачные углы дают артефакты
  [path.join(PUBLIC, 'icon-512-maskable.png'), 512, 0],
  // app/apple-icon.png Next подхватывает сам и добавляет <link rel="apple-touch-icon">
  [path.join(APP, 'apple-icon.png'), 180, 0],
]) {
  await sharp(Buffer.from(svg(radius))).resize(size, size).png().toFile(file)
  console.log('✓', path.relative(root, file))
}
