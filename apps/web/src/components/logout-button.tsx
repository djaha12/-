'use client'

import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc'

export function LogoutButton() {
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = '/'
    },
  })
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Выйти"
      loading={logout.isPending}
      onClick={() => logout.mutate()}
    >
      <LogOut />
    </Button>
  )
}
