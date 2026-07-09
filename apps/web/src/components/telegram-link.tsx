'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Send, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc'

/** Кнопки привязки/отвязки Telegram (/settings/notifications, онбординг) */
export function TelegramLinkButton({
  deepLink,
  variant,
}: {
  deepLink: string
  /** 'soft' — где на экране уже есть свой primary (онбординг: один primary на экран) */
  variant?: 'soft'
}) {
  return (
    <Button asChild variant={variant} className="max-sm:w-full">
      <a href={deepLink} target="_blank" rel="noopener noreferrer">
        <Send aria-hidden />
        Привязать Telegram
      </a>
    </Button>
  )
}

export function TelegramUnlinkButton() {
  const router = useRouter()
  const unlink = trpc.notifications.unlinkTelegram.useMutation({
    onSuccess: () => router.refresh(),
  })
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-11 text-muted-foreground sm:h-9"
      loading={unlink.isPending}
      onClick={() => unlink.mutate()}
    >
      <Unlink aria-hidden />
      Отвязать
    </Button>
  )
}
