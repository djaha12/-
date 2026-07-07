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
            Код придёт в Telegram
          </p>
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
              <>Не пришло? Отправим снова через {resendIn} сек</>
            ) : (
              <button
                type="button"
                onClick={sendCode}
                className="cursor-pointer font-medium text-foreground underline underline-offset-2"
              >
                Отправить ещё раз
              </button>
            )}
          </p>
        </>
      )}
    </div>
  )
}
