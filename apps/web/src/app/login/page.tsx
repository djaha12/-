import type { Metadata } from 'next'
import Link from 'next/link'
import { LoginForm } from '@/components/login-form'

export const metadata: Metadata = {
  title: 'Вход',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>
}) {
  const { step } = await searchParams

  return (
    <main className="flex min-h-dvh flex-col px-4">
      <header className="flex h-16 items-center justify-center">
        <Link href="/" className="font-display text-[22px] font-semibold tracking-tight">
          Ателье
        </Link>
      </header>
      <div className="flex flex-1 items-start justify-center pt-[12vh] pb-16">
        <LoginForm initialStep={step ? Number(step) : 1} />
      </div>
    </main>
  )
}
