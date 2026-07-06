import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ThreadView } from '@/components/thread-view'
import { getSessionUser } from '@/server/auth'
import { getThreadHeader } from '@/server/data'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Диалог' }

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) redirect('/login')
  const header = await getThreadHeader(id, user.id)
  if (!header) notFound()

  return (
    <div className="flex h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-2xl items-center gap-2 px-4 sm:px-6">
          <Button asChild variant="ghost" size="icon" aria-label="Все сообщения">
            <Link href="/messages">
              <ArrowLeft />
            </Link>
          </Button>
          {header.otherSlug ? (
            <Link href={`/s/${header.otherSlug}`} className="flex min-w-0 items-center gap-3">
              <Avatar name={header.otherName} className="size-10" />
              <span className="min-w-0">
                <span className="block truncate font-semibold hover:underline">
                  {header.otherName}
                </span>
                {header.otherProfession ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {header.otherProfession}
                  </span>
                ) : null}
              </span>
            </Link>
          ) : (
            <span className="flex min-w-0 items-center gap-3">
              <Avatar name={header.otherName} className="size-10" />
              <span className="truncate font-semibold">{header.otherName}</span>
            </span>
          )}
        </div>
      </header>

      <ThreadView threadId={header.id} subject={header.subject} otherName={header.otherName} />
    </div>
  )
}
