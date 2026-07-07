import 'server-only'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Хранилище обработанных изображений. Контракт один на dev и prod:
 * putProcessedImage(id, webpBuffer) → { storageKey, src }.
 *
 * Выбор бэкенда — по наличию токена (не по NODE_ENV): так локальный next start
 * без токена тоже пишет на ФС и тестируется как обычно.
 * - Есть BLOB_READ_WRITE_TOKEN: Vercel Blob — раздача по CDN-URL, ФС лямбды read-only.
 *   storageKey = pathname (для будущего del()), src = абсолютный blob-URL.
 * - Нет токена: .data/uploads на диске, раздаётся роутом /uploads/[...file].
 *   storageKey = 'uploads/<id>.webp', src = '/uploads/<id>.webp'.
 *   (На Vercel без Blob запись упадёт EROFS → 422 в роуте — Blob обязателен в проде.)
 *
 * EXIF/GPS-стрип и перекодирование в webp делает вызывающий (api/upload) через sharp —
 * это не зависит от бэкенда хранилища и остаётся server-side (приватность жилья).
 */

const DEV_UPLOAD_DIR = path.join(process.cwd(), '../../.data/uploads')

export interface StoredImage {
  storageKey: string
  src: string
}

export async function putProcessedImage(id: string, data: Buffer): Promise<StoredImage> {
  const key = `uploads/${id}.webp`
  const token = process.env.BLOB_READ_WRITE_TOKEN

  if (token) {
    // динамический импорт: dev-ветка не тянет @vercel/blob
    const { put } = await import('@vercel/blob')
    const blob = await put(key, data, {
      access: 'public',
      contentType: 'image/webp',
      addRandomSuffix: false,
      token,
    })
    return { storageKey: blob.pathname, src: blob.url }
  }

  await mkdir(DEV_UPLOAD_DIR, { recursive: true })
  await writeFile(path.join(DEV_UPLOAD_DIR, `${id}.webp`), data)
  return { storageKey: key, src: `/${key}` }
}
