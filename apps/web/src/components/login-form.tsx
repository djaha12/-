'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { trpc } from '@/lib/trpc'

const normalizePhone = (raw: string) => `+${raw.replace(/\D/g, '')}`

/** Вход в 2 шага: телефон → код. Код приходит в Telegram, SMS — запасной канал. */
export function LoginForm({ initialStep = 1 }: { initialStep?: number }) {
  const router = useRouter()
  const [step, setStep] = React.useState(initialStep)
  const [phone, setPhone] = React.useState(initialStep > 1 ? '+996 555 123 456' : '+996 ')
  const [code, setCode] = React.useState('')
  const [devCode, setDevCode] = React.useState<string | undefined>()
  const [resendIn, setResendIn] = React.useState(0)

  React.useEffect(() => {
    if (resendIn <= 0) return
    const t = setInterval(() => setResendIn((s) => s - 1), 1000)
    return () => clearInterval(t)
  }, [resendIn])

  const requestOtp = trpc.auth.requestOtp.useMutation({
    onSuccess: (data) => {
      setDevCode(data.devCode)
      setStep(2)
      setResendIn(60)
      setCode('')
    },
  })
  const verifyOtp = trpc.auth.verifyOtp.useMutation({
    onSuccess: () => {
      router.push('/')
      router.refresh()
    },
  })

  const sendCode = () => requestOtp.mutate({ phone: normalizePhone(phone) })

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-center font-display text-3xl font-semibold tracking-tight">
        {step === 1 ? 'Вход или регистрация' : 'Код из Telegram'}
      </h1>

      {step === 1 ? (
        <>
          <p className="mt-2 text-center text-[15px] leading-relaxed text-muted-foreground">
            Один номер — и для клиентов, и для специалистов.
          </p>
          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              sendCode()
            }}
          >
            <label className="block">
              <span className="sr-only">Номер телефона</span>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                autoFocus
                value={phone}
                aria-invalid={requestOtp.isError || undefined}
                onChange={(e) => setPhone(e.target.value)}
                className="h-12 text-center text-lg font-semibold tracking-wide"
              />
            </label>
            {requestOtp.isError ? (
              <p className="text-center text-[13px] text-danger">{requestOtp.error.message}</p>
            ) : null}
            <Button type="submit" size="lg" className="w-full" loading={requestOtp.isPending}>
              Получить код
            </Button>
          </form>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] text-muted-foreground">
            <Send className="size-3.5" aria-hidden />
            Код придёт в Telegram, запасной канал — SMS
          </p>
          <div className="mt-6 flex items-center gap-3 text-xs text-faint-foreground">
            <span className="h-px flex-1 bg-border" aria-hidden />
            или
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          <Button variant="secondary" size="lg" className="mt-4 w-full">
            <svg viewBox="0 0 24 24" aria-hidden className="size-4.5">
              <path
                fill="#4285F4"
                d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.87c2.27-2.09 3.58-5.17 3.58-8.81Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.76l3.98-3.1Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.77c1.76 0 3.35.6 4.6 1.8l3.44-3.44A11.98 11.98 0 0 0 1.29 6.62l3.98 3.1C6.22 6.88 8.87 4.77 12 4.77Z"
              />
            </svg>
            Продолжить с Google
          </Button>
          <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
            Продолжая, вы принимаете{' '}
            <a href="#" className="underline underline-offset-2 hover:text-foreground">
              условия сервиса
            </a>{' '}
            и{' '}
            <a href="#" className="underline underline-offset-2 hover:text-foreground">
              политику конфиденциальности
            </a>
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 text-center text-[15px] leading-relaxed text-muted-foreground">
            Отправили на {phone}.{' '}
            <button
              type="button"
              onClick={() => setStep(1)}
              className="cursor-pointer font-medium text-foreground underline underline-offset-2"
            >
              Изменить номер
            </button>
          </p>
          {devCode ? (
            <p className="mx-auto mt-3 w-fit rounded-full bg-accent-soft px-4 py-1.5 text-[13px] font-semibold text-accent-soft-foreground">
              Dev-режим: ваш код {devCode}
            </p>
          ) : null}
          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              verifyOtp.mutate({ phone: normalizePhone(phone), code })
            }}
          >
            <label className="block">
              <span className="sr-only">Код подтверждения</span>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                value={code}
                placeholder="••••••"
                aria-invalid={verifyOtp.isError || undefined}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="h-14 text-center text-2xl font-bold tracking-[0.5em]"
              />
            </label>
            {verifyOtp.isError ? (
              <p className="text-center text-[13px] text-danger">{verifyOtp.error.message}</p>
            ) : null}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={code.length !== 6}
              loading={verifyOtp.isPending}
            >
              Войти
            </Button>
          </form>
          <p className="mt-3 text-center text-[13px] text-muted-foreground">
            {resendIn > 0 ? (
              <>Не пришло? Отправим снова через {resendIn} сек · </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={sendCode}
                  className="cursor-pointer font-medium text-foreground underline underline-offset-2"
                >
                  Отправить ещё раз
                </button>{' '}
                ·{' '}
              </>
            )}
            <button
              type="button"
              className="cursor-pointer font-medium text-foreground underline underline-offset-2"
            >
              Прислать по SMS
            </button>
          </p>
        </>
      )}
    </div>
  )
}
