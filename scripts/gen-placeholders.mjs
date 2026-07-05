// Генерация арт-плейсхолдеров для mock-данных: тёплые градиенты + архитектурные
// линейные мотивы + зерно. Сеть окружения закрыта для фото-CDN, поэтому демо-контент
// генерируется локально; в staging/prod подставляются реальные фотографии.
// Выход: apps/web/public/mock/*.jpg + apps/web/src/mock/images.json (размеры + blurDataURL)
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT_DIR = path.join(root, 'apps/web/public/mock')
const MANIFEST = path.join(root, 'apps/web/src/mock/images.json')

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PALETTES = {
  sand: ['#E7D9C2', '#AE9068'],
  clay: ['#D9B29A', '#8A5A3B'],
  terra: ['#CE8A64', '#7E4327'],
  sage: ['#C2C8B0', '#67735A'],
  olive: ['#BCB894', '#615E3F'],
  stone: ['#D8D3CB', '#8C857B'],
  graphite: ['#5A575E', '#242226'],
  slate: ['#A9B4BD', '#4F5D68'],
  powder: ['#E3D6CE', '#A08D84'],
  umber: ['#9C7B62', '#4E3A2C'],
  night: ['#3E4048', '#191A20'],
  cream: ['#F0E7D6', '#C0AE8C'],
}

// мотивы в системе координат 0..1000
const MOTIFS = {
  arch: 'M300 830 V470 A200 200 0 0 1 700 470 V830 M390 830 V520 A110 110 0 0 1 610 520 V830',
  windows:
    'M180 240 h160 v200 h-160 Z M420 240 h160 v200 h-160 Z M660 240 h160 v200 h-160 Z M180 560 h160 v200 h-160 Z M420 560 h160 v200 h-160 Z M660 560 h160 v200 h-160 Z',
  stairs: 'M220 810 H390 V700 H540 V590 H690 V480 H840 M390 810 V700 M540 700 V590 M690 590 V480',
  plan: 'M220 240 H780 V780 H220 Z M500 240 V500 M500 500 H340 M500 500 A150 150 0 0 1 650 650 M220 620 H360',
  sun: 'M330 430 a170 170 0 1 1 340 0 a170 170 0 1 1 -340 0 M170 740 H830 M270 810 H730',
  hills: 'M110 770 Q330 540 530 690 T890 640 M110 860 Q420 690 890 790',
  frames: 'M280 240 h330 v420 h-330 Z M430 390 h300 v380 h-300 Z',
  columns: 'M260 260 H740 M300 260 V800 M433 260 V800 M566 260 V800 M700 260 V800 M260 800 H740',
  roof: 'M200 700 L500 370 L800 700 M320 700 V830 M680 700 V830 M470 700 h60 M620 430 V320 h60 V500',
}

function svgArt({ w, h, palette, motif, seed }) {
  const rnd = mulberry32(seed)
  const [c1, c2] = PALETTES[palette]
  const angle = 25 + Math.floor(rnd() * 120)
  const rad = (angle * Math.PI) / 180
  const x2 = 50 + 50 * Math.cos(rad)
  const y2 = 50 + 50 * Math.sin(rad)
  const hlx = 20 + rnd() * 60
  const hly = 10 + rnd() * 45
  const scale = (Math.min(w, h) / 1000) * (0.82 + rnd() * 0.2)
  const mx = w / 2 - 500 * scale + (rnd() - 0.5) * w * 0.12
  const my = h / 2 - 500 * scale + (rnd() - 0.5) * h * 0.1
  const d = MOTIFS[motif]

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="${x2}%" y2="${y2}%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
    <radialGradient id="hl" cx="${hlx}%" cy="${hly}%" r="80%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.30"/>
      <stop offset="55%" stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vg" cx="50%" cy="48%" r="75%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="78%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.18"/>
    </radialGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#hl)"/>
  <g transform="translate(${mx + 9 * scale} ${my + 11 * scale}) scale(${scale})"
     fill="none" stroke="#1c130d" stroke-opacity="0.10" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">
    <path d="${d}"/>
  </g>
  <g transform="translate(${mx} ${my}) scale(${scale})"
     fill="none" stroke="#ffffff" stroke-opacity="0.30" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">
    <path d="${d}"/>
  </g>
  <rect width="100%" height="100%" fill="url(#vg)"/>
  <rect width="100%" height="100%" filter="url(#grain)" opacity="0.05"/>
</svg>`
}

const F = 960 // базовая ширина ленты
const SPEC = [
  // лента c01..c24 — разные форматы, палитры, мотивы
  { id: 'c01', w: F, h: 1280, palette: 'terra', motif: 'arch' },
  { id: 'c02', w: F, h: 1200, palette: 'sand', motif: 'windows' },
  { id: 'c03', w: F, h: 720, palette: 'slate', motif: 'sun' },
  { id: 'c04', w: F, h: 960, palette: 'clay', motif: 'frames' },
  { id: 'c05', w: F, h: 1200, palette: 'sage', motif: 'hills' },
  { id: 'c06', w: F, h: 1280, palette: 'powder', motif: 'windows' },
  { id: 'c07', w: F, h: 720, palette: 'stone', motif: 'roof' },
  { id: 'c08', w: F, h: 1200, palette: 'night', motif: 'columns' },
  { id: 'c09', w: F, h: 960, palette: 'cream', motif: 'frames' },
  { id: 'c10', w: F, h: 1440, palette: 'umber', motif: 'arch' },
  { id: 'c11', w: F, h: 1200, palette: 'sage', motif: 'sun' },
  { id: 'c12', w: F, h: 720, palette: 'sand', motif: 'plan' },
  { id: 'c13', w: F, h: 1280, palette: 'graphite', motif: 'columns' },
  { id: 'c14', w: F, h: 1200, palette: 'stone', motif: 'arch' },
  { id: 'c15', w: F, h: 960, palette: 'clay', motif: 'stairs' },
  { id: 'c16', w: F, h: 1280, palette: 'powder', motif: 'sun' },
  { id: 'c17', w: F, h: 720, palette: 'slate', motif: 'hills' },
  { id: 'c18', w: F, h: 1200, palette: 'night', motif: 'frames' },
  { id: 'c19', w: F, h: 960, palette: 'terra', motif: 'windows' },
  { id: 'c20', w: F, h: 1440, palette: 'cream', motif: 'arch' },
  { id: 'c21', w: F, h: 720, palette: 'olive', motif: 'hills' },
  { id: 'c22', w: F, h: 1200, palette: 'graphite', motif: 'plan' },
  { id: 'c23', w: F, h: 960, palette: 'sand', motif: 'windows' },
  { id: 'c24', w: F, h: 720, palette: 'olive', motif: 'sun' },
  // галерея кейса
  { id: 'g1', w: 1600, h: 1067, palette: 'terra', motif: 'arch' },
  { id: 'g2', w: 1200, h: 1600, palette: 'clay', motif: 'stairs' },
  { id: 'g3', w: 1200, h: 800, palette: 'sand', motif: 'plan' },
  { id: 'g4', w: 1200, h: 800, palette: 'umber', motif: 'windows' },
  { id: 'g5', w: 1200, h: 1600, palette: 'powder', motif: 'frames' },
  { id: 'g6', w: 1200, h: 800, palette: 'stone', motif: 'columns' },
  // до/после
  { id: 'ba-before', w: 1400, h: 900, palette: 'graphite', motif: 'plan' },
  { id: 'ba-after', w: 1400, h: 900, palette: 'terra', motif: 'arch' },
  // обложка профиля
  { id: 'cover1', w: 1920, h: 560, palette: 'sand', motif: 'hills' },
  // сделки риелторов (d*) + обложка риелтора
  { id: 'd01', w: F, h: 720, palette: 'slate', motif: 'windows' },
  { id: 'd02', w: F, h: 1200, palette: 'sand', motif: 'frames' },
  { id: 'd03', w: F, h: 720, palette: 'stone', motif: 'roof' },
  { id: 'd04', w: F, h: 960, palette: 'night', motif: 'columns' },
  { id: 'd05', w: F, h: 1200, palette: 'powder', motif: 'windows' },
  { id: 'd06', w: F, h: 960, palette: 'graphite', motif: 'frames' },
  { id: 'dg-hero', w: 1600, h: 1067, palette: 'slate', motif: 'windows' },
  { id: 'cover2', w: 1920, h: 560, palette: 'slate', motif: 'hills' },
]

await mkdir(OUT_DIR, { recursive: true })
const manifest = {}

for (const [i, spec] of SPEC.entries()) {
  const svg = svgArt({ ...spec, seed: 1000 + i * 7919 })
  const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 84, mozjpeg: true }).toBuffer()
  await writeFile(path.join(OUT_DIR, `${spec.id}.jpg`), jpeg)
  const blur = await sharp(jpeg).resize(14).webp({ quality: 30 }).toBuffer()
  manifest[spec.id] = {
    src: `/mock/${spec.id}.jpg`,
    width: spec.w,
    height: spec.h,
    blurDataURL: `data:image/webp;base64,${blur.toString('base64')}`,
  }
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 2))
console.log(`✓ ${SPEC.length} плейсхолдеров → ${OUT_DIR}`)
console.log(`✓ манифест → ${MANIFEST}`)
