import Link from 'next/link'
import { cn } from '@/lib/utils'

const COLUMNS = [
  {
    title: 'Клиентам',
    links: ['Проекты', 'Специалисты', 'Создать бриф', 'Как выбирать'],
  },
  {
    title: 'Специалистам',
    links: ['Разместить портфолио', 'Тарифы', 'Правила публикации', 'Верификация'],
  },
  {
    title: 'Ателье',
    links: ['О платформе', 'Оферта', 'Конфиденциальность', 'Поддержка'],
  },
] as const

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn('border-t border-border bg-surface', className)}>
      <div className="mx-auto grid max-w-[1360px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <p className="font-display text-[22px] font-semibold tracking-tight">Ателье</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Портфолио и честная репутация специалистов недвижимости Кыргызстана.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {col.title}
            </p>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l}>
                  <Link
                    href="#"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:px-6">
          <p>© 2026 Ателье · Бишкек</p>
          <p>Русский · Кыргызча · English</p>
        </div>
      </div>
    </footer>
  )
}
