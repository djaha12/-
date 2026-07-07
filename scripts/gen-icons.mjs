// Иконки PWA: терракотовый квадрат с серифной «А» (бренд-минимум без внешних ресурсов).
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT = path.join(root, 'apps/web/public')
mkdirSync(OUT, { recursive: true })

const svg = (size, radius) => `
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="${radius}" fill="#b0603f"/>
  <text x="256" y="352" font-family="Georgia, 'Times New Roman', serif" font-size="300"
        font-weight="700" fill="#f8f5f0" text-anchor="middle">А</text>
</svg>`

for (const [file, size, radius] of [
  ['icon-192.png', 192, 96],
  ['icon-512.png', 512, 112],
  ['apple-icon.png', 180, 0], // iOS сам скругляет
]) {
  await sharp(Buffer.from(svg(512, radius))).resize(size, size).png().toFile(path.join(OUT, file))
  console.log('✓', file)
}
