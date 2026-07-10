import Link from 'next/link'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { getDict } from '@/i18n/server'
import type { Dict } from '@/i18n/dictionaries'
import { cn } from '@/lib/utils'

// колонки собираются из словаря запроса — ключи и маршруты стабильны, подписи локализуются
function columns(t: Dict) {
  return [
    {
      title: t.footer.forClients,
      links: [
        { label: t.footer.projects, href: '/' },
        { label: t.footer.specialists, href: '/specialists' },
        { label: t.footer.createBrief, href: '/briefs/new' },
        { label: t.footer.howToChoose, href: '#' },
      ],
    },
    {
      title: t.footer.forSpecialists,
      links: [
        { label: t.footer.placePortfolio, href: '/onboarding' },
        { label: t.footer.pricing, href: '/pro' },
        { label: t.footer.publishingRules, href: '#' },
        { label: t.footer.verification, href: '#' },
      ],
    },
    {
      title: t.footer.atelier,
      links: [
        { label: t.footer.about, href: '#' },
        { label: t.footer.terms, href: '#' },
        { label: t.footer.privacy, href: '#' },
        { label: t.footer.support, href: '#' },
      ],
    },
  ]
}

export async function SiteFooter({ className }: { className?: string }) {
  const { t } = await getDict()
  return (
    <footer className={cn('border-t border-border bg-surface', className)}>
      <div className="mx-auto grid max-w-[1360px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <p className="font-display text-[22px] font-semibold tracking-tight">Ателье</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
            {t.footer.tagline}
          </p>
        </div>
        {columns(t).map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {col.title}
            </p>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:px-6">
          <p>{t.footer.copyright}</p>
          <LocaleSwitcher />
        </div>
      </div>
    </footer>
  )
}
