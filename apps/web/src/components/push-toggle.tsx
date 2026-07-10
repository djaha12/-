'use client'

import * as React from 'react'
import { BellRing } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/client'
import { trpc } from '@/lib/trpc'

/**
 * Тумблер Web Push (M11). Сервер передаёт публичный VAPID-ключ пропом
 * (страница серверная — без лишнего запроса). Состояние подписки живёт
 * в браузере — читаем его из service worker после маунта.
 */

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function PushToggle({ vapidKey }: { vapidKey: string }) {
  const { t } = useI18n()
  // null = ещё выясняем; поддержка/запрет — терминальные состояния
  const [subscribed, setSubscribed] = React.useState<boolean | null>(null)
  const [blocked, setBlocked] = React.useState<'unsupported' | 'denied' | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const subscribe = trpc.notifications.subscribePush.useMutation()
  const unsubscribe = trpc.notifications.unsubscribePush.useMutation()

  React.useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setBlocked('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setBlocked('denied')
      return
    }
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => setSubscribed(false))
  }, [])

  const enable = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        if (permission === 'denied') setBlocked('denied')
        return
      }
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        }))
      const json = sub.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('bad sub')
      await subscribe.mutateAsync({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent.slice(0, 300),
      })
      setSubscribed(true)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await unsubscribe.mutateAsync({ endpoint: sub.endpoint })
        await sub.unsubscribe()
      }
      setSubscribed(false)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  if (blocked)
    return (
      <p className="rounded-xl bg-surface-muted px-4 py-3 text-sm leading-relaxed text-muted-foreground">
        {blocked === 'unsupported' ? t.push.unsupported : t.push.denied}
      </p>
    )

  return (
    <div>
      {subscribed ? (
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="success" size="md">
            {t.push.enabled}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-11 text-muted-foreground sm:h-9"
            loading={busy}
            onClick={disable}
          >
            {t.push.disable}
          </Button>
        </div>
      ) : (
        // secondary: единственный primary экрана — привязка Telegram (главный канал)
        <Button
          variant="secondary"
          onClick={enable}
          loading={busy || subscribed === null}
          className="max-sm:w-full"
        >
          <BellRing aria-hidden />
          {t.push.enable}
        </Button>
      )}
      {failed ? <p className="mt-2 text-[13px] text-danger">{t.push.error}</p> : null}
    </div>
  )
}
