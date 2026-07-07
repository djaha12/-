import type { Metadata } from 'next'
import Link from 'next/link'
import { Check, Minus } from 'lucide-react'
import { PLAN_LIMITS } from '@atelier/core'
import { PromoForm } from '@/components/promo-form'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getSessionUser } from '@/server/auth'
import { getProUntil } from '@/server/plan'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Тарифы',
  description:
    'Free — полноценный старт: портфолио, заявки, заказы и отзывы. PRO — безлимит кейсов, больше откликов на брифы и приоритет в каталоге.',
}

const ROWS: Array<{ label: string; free: string | boolean; pro: string | boolean }> = [
  { label: 'Опубликованные кейсы', free: `до ${PLAN_LIMITS.FREE.maxPublishedCases}`, pro: 'без лимита' },
  { label: 'Отклики на брифы в месяц', free: String(PLAN_LIMITS.FREE.maxBriefResponsesPerMonth), pro: 'без лимита' },
  { label: 'Заявки, чат, заказы и отзывы', free: true, pro: true },
  { label: 'Бейдж «Сделка подтверждена клиентом»', free: true, pro: true },
  { label: 'Приоритет в каталоге специалистов', free: false, pro: true },
  { label: 'Бейдж PRO на профиле и в каталоге', free: false, pro: true },
]

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <Check className="mx-auto size-4 text-success" aria-label="Да" />
  if (v === false) return <Minus className="mx-auto size-4 text-faint-foreground" aria-label="Нет" />
  return <span className="text-sm font-medium">{v}</span>
}

export default async function ProPage() {
  const user = await getSessionUser()
  const proUntil = user ? await getProUntil(user.id) : null

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 pb-20 sm:px-6">
        <h1 className="pt-10 font-display text-[32px] leading-[1.12] font-semibold tracking-tight sm:text-4xl">
          Тарифы
        </h1>
        <p className="mt-2 mb-8 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Free — полноценный старт без ограничений по сделкам и отзывам. PRO снимает лимиты
          публикаций и поднимает вас в каталоге.
        </p>

        {proUntil ? (
          <p className="mb-6 rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success">
            У вас PRO до {proUntil.toLocaleDateString('ru-RU')}.
          </p>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3.5 text-sm font-semibold sm:px-5">Что входит</th>
                <th className="w-28 px-3 py-3.5 text-center text-sm font-semibold">Free</th>
                <th className="w-28 px-3 py-3.5 text-center">
                  <Badge variant="accent" size="sm">
                    PRO
                  </Badge>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ROWS.map((r) => (
                <tr key={r.label}>
                  <td className="px-4 py-3 text-sm sm:px-5">{r.label}</td>
                  <td className="px-3 py-3 text-center text-muted-foreground">
                    <Cell v={r.free} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Cell v={r.pro} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-8 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
          <h2 className="font-display text-lg font-semibold">Активировать PRO</h2>
          <p className="mt-1.5 mb-4 text-sm leading-relaxed text-muted-foreground">
            Оплата картой (Mbank, O!Деньги, Элсом) появится вместе с запуском — пока PRO
            включается промокодом.
          </p>
          {user ? (
            <PromoForm />
          ) : (
            <Button asChild variant="soft">
              <Link href="/login">Войдите, чтобы применить промокод</Link>
            </Button>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
