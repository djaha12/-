import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Общий рендер OG-карточек и сторис-визиток (next/og → satori).
 * Шрифты — Liberation (метрики Arial/Times, полная кириллица) из репозитория:
 * satori не умеет woff2 из @fontsource, а сетевые шрифты в проде — лишняя зависимость.
 * Фото: satori понимает jpeg/png; webp из нашего пайплайна пока пропускаем —
 * такие кейсы получают типографскую карточку (конверсия для OG — вместе с R2).
 */

// приближения oklch-токенов globals.css для satori (hex)
export const OG = {
  paper: '#f8f5f0',
  surface: '#fdfcfa',
  ink: '#2b2521',
  muted: '#6f675f',
  accent: '#b0603f',
  accentSoft: '#f6e3d9',
  success: '#3d8b62',
  border: '#e5ded4',
} as const

const FONT_DIR = path.join(process.cwd(), 'src/server/og/fonts')

let fontsPromise: Promise<
  Array<{ name: string; data: ArrayBuffer; weight: 400 | 600 | 700; style: 'normal' }>
> | null = null

export function loadOgFonts() {
  fontsPromise ??= Promise.all([
    readFile(path.join(FONT_DIR, 'LiberationSans-Regular.ttf')),
    readFile(path.join(FONT_DIR, 'LiberationSans-Bold.ttf')),
    readFile(path.join(FONT_DIR, 'LiberationSerif-Bold.ttf')),
  ]).then(([sans, sansBold, serifBold]) => [
    { name: 'Sans', data: toArrayBuffer(sans), weight: 400 as const, style: 'normal' as const },
    { name: 'Sans', data: toArrayBuffer(sansBold), weight: 700 as const, style: 'normal' as const },
    { name: 'Serif', data: toArrayBuffer(serifBold), weight: 700 as const, style: 'normal' as const },
  ])
  return fontsPromise
}

function toArrayBuffer(b: Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

/** Обложка → data URL для satori. null, если формат не поддержан (webp) или файла нет. */
export async function coverDataUrl(src: string): Promise<string | null> {
  try {
    if (src.startsWith('/mock/') && src.endsWith('.jpg')) {
      const file = await readFile(path.join(process.cwd(), 'public', src))
      return `data:image/jpeg;base64,${file.toString('base64')}`
    }
    // /uploads/*.webp — satori не рендерит webp; типографская карточка
    return null
  } catch {
    return null
  }
}

export function formatSomOg(value: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(value).replace(/ /g, ' ')} сом`
}
