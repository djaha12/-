import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { getSessionUser } from '@/server/auth'
import { putProcessedImage } from '@/server/storage'

/**
 * Пайплайн изображений M2: перекодирование срезает EXIF/GPS (приватность жилья),
 * max 1600px, webp + blur-плейсхолдер. Хранилище — за абстракцией storage.ts
 * (Vercel Blob в проде, .data/uploads в dev). Node-рантайм обязателен (sharp).
 */
export const runtime = 'nodejs'
// клиент даунскейлит до загрузки; серверный потолок ниже лимита тела Vercel (~4.5 МБ)
const MAX_BYTES = 4 * 1024 * 1024

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Войдите, чтобы загружать фото.' }, { status: 401 })
  }

  // отклоняем большие тела по заголовку — до чтения multipart в память.
  // На Vercel тело >~4.5 МБ режется платформой раньше (413), поэтому клиент даунскейлит.
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'Фото слишком большое — уменьшите и повторите.' }, { status: 413 })
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Файл не получен.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Фото слишком большое — уменьшите и повторите.' }, { status: 413 })
  }

  try {
    const input = Buffer.from(await file.arrayBuffer())
    const id = randomBytes(10).toString('hex')

    const main = sharp(input).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    const { data, info } = await main.webp({ quality: 82 }).toBuffer({ resolveWithObject: true })
    const blur = await sharp(data).resize(14).webp({ quality: 30 }).toBuffer()

    const { storageKey, src } = await putProcessedImage(id, data)

    return NextResponse.json({
      storageKey,
      src,
      blurDataURL: `data:image/webp;base64,${blur.toString('base64')}`,
      width: info.width,
      height: info.height,
    })
  } catch (e) {
    console.error('[upload]', e)
    return NextResponse.json(
      { error: 'Не получилось обработать фото. Поддерживаются JPG, PNG, WebP и HEIC.' },
      { status: 422 },
    )
  }
}
