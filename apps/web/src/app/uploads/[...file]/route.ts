import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'

const UPLOAD_DIR = path.join(process.cwd(), '../../.data/uploads')

// раздача dev/локального ФС-хранилища. На Vercel с Blob src = абсолютный URL,
// сюда не заходят; без Blob файлов на ФС нет → естественный 404 из catch ниже.
export async function GET(_req: Request, ctx: { params: Promise<{ file: string[] }> }) {
  const { file } = await ctx.params
  const name = file.join('/')
  // без путей наружу: только плоские webp-имена из /api/upload
  if (!/^[a-f0-9]+\.webp$/.test(name)) {
    return new NextResponse('Not found', { status: 404 })
  }
  try {
    const data = await readFile(path.join(UPLOAD_DIR, name))
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }
}
