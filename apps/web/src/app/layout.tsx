import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from 'next-themes'
import { RefCapture } from '@/components/ref-capture'
import { I18nProvider } from '@/i18n/client'
import { getLocale } from '@/i18n/server'
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <RefCapture />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <I18nProvider locale={locale}>
            <TrpcProvider>{children}</TrpcProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
