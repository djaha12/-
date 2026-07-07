import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

// корень монорепо — для трейсинга файлов вне apps/web (движок Prisma в pnpm-сторе)
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../')

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@atelier/db', '@atelier/core'],

  images: {
    // фото кейсов раздаёт CDN Vercel Blob (прод); dev-картинки — с того же origin
    remotePatterns: [
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com', pathname: '/**' },
    ],
  },

  // pnpm-монорепо: движок Prisma (.so.node) и schema.prisma лежат в корневом сторе
  // выше apps/web — nft их часто не трейсит в лямбду → PrismaClientInitializationError.
  // Шрифты OG и мок-обложки читаются с ФС в OG-роуте — их тоже кладём в бандл.
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    '/**': ['../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/**'],
    '/api/og/**': ['./src/server/og/fonts/**', './public/mock/**'],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // клик-джекинг над действиями заказа/модерации — фрейминг запрещён
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
