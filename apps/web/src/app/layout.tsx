import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from 'next-themes'
import { TrpcProvider } from '@/lib/trpc'
import { SITE_NAME, SITE_URL } from '@/lib/site'
import '@fontsource-variable/manrope'
import '@fontsource-variable/lora'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Ателье — портфолио и специалисты недвижимости',
    template: '%s — Ателье',
  },
  description:
    'Дизайнеры интерьера, архитекторы, риелторы и визуализаторы Кыргызстана. Реальные проекты, честные отзывы.',
  openGraph: { siteName: SITE_NAME, locale: 'ru_RU', type: 'website' },
  twitter: { card: 'summary_large_image' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // фиксированные нижние бары уважают home-индикатор iOS (safe-area-inset)
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <TrpcProvider>{children}</TrpcProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
