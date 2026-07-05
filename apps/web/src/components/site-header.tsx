import Link from 'next/link'
import { MapPin, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1360px] items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <Link href="/" className="shrink-0 font-display text-[22px] font-semibold tracking-tight">
          Ателье
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Основная навигация">
          <Link
            href="/"
            className="rounded-full px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
          >
            Проекты
          </Link>
          <Link
            href="#"
            className="rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            Специалисты
          </Link>
          <Link
            href="#"
            className="rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            Брифы
          </Link>
        </nav>

        <div className="relative ml-auto hidden w-full max-w-sm md:block">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-faint-foreground"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Стиль, специалист или район…"
            className="h-10 w-full rounded-full border border-border bg-surface pr-4 pl-10 text-sm placeholder:text-faint-foreground transition-colors hover:border-border-strong focus:border-border-strong focus:outline-none"
          />
        </div>

        <div className="flex shrink-0 items-center gap-1 md:ml-0 ml-auto">
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Поиск">
            <Search />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground max-md:h-11 max-sm:px-2.5"
          >
            <MapPin aria-hidden />
            <span className="max-[400px]:sr-only">Бишкек</span>
          </Button>
          <ThemeToggle />
          <Button variant="ghost" size="sm" className="max-md:h-11">
            Войти
          </Button>
          {/* один терракотовый primary на экран — у хедера только soft */}
          <Button variant="soft" size="sm" className="hidden md:inline-flex">
            Я специалист
          </Button>
        </div>
      </div>
    </header>
  )
}
