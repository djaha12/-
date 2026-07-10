import Link from 'next/link'
import { Bell, Bookmark, MapPin, MessageCircle, Search, ShieldCheck } from 'lucide-react'
import { canModerate } from '@atelier/core'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { LogoutButton } from '@/components/logout-button'
import { MobileMenu } from '@/components/mobile-menu'
import { ThemeToggle } from '@/components/theme-toggle'
import { getDict } from '@/i18n/server'
import { fmt } from '@/i18n/dictionaries'
import { getSessionUser } from '@/server/auth'
import { getUnreadNotificationsCount } from '@/server/data'

export async function SiteHeader() {
  const user = await getSessionUser()
  const unread = user ? await getUnreadNotificationsCount(user.id) : 0
  const { t } = await getDict()

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1360px] items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <Link href="/" className="shrink-0 font-display text-[22px] font-semibold tracking-tight">
          Ателье
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label={t.header.nav}>
          <Link
            href="/"
            className="rounded-full px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
          >
            {t.header.projects}
          </Link>
          <Link
            href="/specialists"
            className="rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            {t.header.specialists}
          </Link>
          <Link
            href="/briefs"
            className="rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            {t.header.briefs}
          </Link>
        </nav>

        <form action="/specialists" className="relative ml-auto hidden w-full max-w-sm md:block">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-faint-foreground"
            aria-hidden
          />
          <input
            type="search"
            name="q"
            placeholder={t.header.searchPlaceholder}
            className="h-10 w-full rounded-full border border-border bg-surface pr-4 pl-10 text-sm placeholder:text-faint-foreground transition-colors hover:border-border-strong focus:border-border-strong focus:outline-none"
          />
        </form>

        <div className="flex shrink-0 items-center gap-1 md:ml-0 ml-auto">
          <Button asChild variant="ghost" size="icon" className="md:hidden" aria-label={t.header.search}>
            <Link href="/specialists">
              <Search />
            </Link>
          </Button>
          {/* город пока один — на мобильном ряд контролов дороже декоративной кнопки */}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground max-md:hidden"
          >
            <MapPin aria-hidden />
            {t.header.city}
          </Button>
          <ThemeToggle />
          {user ? (
            <>
              {canModerate(user.role) ? (
                // на 390 ряд из 8 контролов душит шапку — щит только с md
                <Button asChild variant="ghost" size="icon" aria-label={t.header.moderation} className="max-md:hidden">
                  <Link href="/admin">
                    <ShieldCheck />
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="ghost" size="icon" className="relative">
                {/* prefetch выключен: заход на страницу помечает уведомления прочитанными */}
                <Link
                  href="/notifications"
                  prefetch={false}
                  aria-label={
                    unread > 0 ? fmt(t.header.notificationsUnread, { n: unread }) : t.header.notifications
                  }
                >
                  <Bell />
                  {unread > 0 ? (
                    <span
                      className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-none font-semibold text-accent-foreground"
                      aria-hidden
                    >
                      {unread > 9 ? '9+' : unread}
                    </span>
                  ) : null}
                </Link>
              </Button>
              <Button asChild variant="ghost" size="icon" aria-label={t.header.messages}>
                <Link href="/messages">
                  <MessageCircle />
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="icon"
                aria-label={t.header.saved}
                className="max-md:hidden"
              >
                <Link href="/saved">
                  <Bookmark />
                </Link>
              </Button>
              <Link
                href={user.specialistSlug ? `/s/${user.specialistSlug}` : '/saved'}
                className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 transition-colors hover:bg-surface-muted"
              >
                <Avatar name={user.displayName ?? user.phone ?? 'Я'} className="size-9 text-xs" />
                <span className="max-w-36 truncate text-sm font-medium max-sm:hidden">
                  {user.displayName ?? t.header.profile}
                </span>
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="max-md:h-11">
                <Link href="/login">{t.header.login}</Link>
              </Button>
              {/* один терракотовый primary на экран — у хедера только soft */}
              <Button asChild variant="soft" size="sm" className="hidden md:inline-flex">
                <Link href="/onboarding">{t.header.imSpecialist}</Link>
              </Button>
            </>
          )}
          {/* мобильная навигация: Проекты/Специалисты/Брифы + «Я специалист» */}
          <MobileMenu showSpecialistCta={!user?.specialistSlug} />
        </div>
      </div>
    </header>
  )
}
