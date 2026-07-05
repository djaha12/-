import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { getSessionUser } from '@/server/auth'

/**
 * Пайплайн изображений M2 (dev-хранилище: .data/uploads; prod — R2 тем же контрактом):
 * перекодирование срезает EXIF/GPS (приватность жилья), max 1600px, webp + blur-плейсхолдер.
 */
const UPLOAD_DIR = path.join(process.cwd(), '../../.data/uploads')
const MAX_BYTES = 15 * 1024 * 1024

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Войдите, чтобы загружать фото.' }, { status: 401 })
  }

  // отклоняем большие тела по заголовку — до чтения multipart в память
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'Файл больше 15 МБ — сожмите фото.' }, { status: 413 })
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Файл не получен.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Файл больше 15 МБ — сожмите фото.' }, { status: 413 })
  }

  try {
    const input = Buffer.from(await file.arrayBuffer())
    const id = randomBytes(10).toString('hex')

    const main = sharp(input).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    const { data, info } = await main.webp({ quality: 82 }).toBuffer({ resolveWithObject: true })
    const blur = await sharp(data).resize(14).webp({ quality: 30 }).toBuffer()

    await mkdir(UPLOAD_DIR, { recursive: true })
    const filename = `${id}.webp`
    await writeFile(path.join(UPLOAD_DIR, filename), data)

    return NextResponse.json({
      storageKey: `uploads/${filename}`,
      src: `/uploads/${filename}`,
      blurDataURL: `data:image/webp;base64,${blur.toString('base64')}`,
      width: info.width,
      height: info.height,
    })
  } catch {
    return NextResponse.json(
      { error: 'Не получилось обработать фото. Поддерживаются JPG, PNG, WebP и HEIC.' },
      { status: 422 },
    )
  }
}
