'use client'

import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cn } from '@/lib/utils'

/* Инициалы на тёплых подложках — аватары без фото выглядят намеренно */
const FALLBACK_TONES = [
  'bg-[oklch(0.92_0.03_45)] text-[oklch(0.45_0.1_40)] dark:bg-[oklch(0.32_0.04_45)] dark:text-[oklch(0.82_0.07_48)]',
  'bg-[oklch(0.92_0.025_155)] text-[oklch(0.42_0.08_155)] dark:bg-[oklch(0.3_0.03_155)] dark:text-[oklch(0.8_0.07_155)]',
  'bg-[oklch(0.92_0.02_260)] text-[oklch(0.44_0.06_260)] dark:bg-[oklch(0.31_0.03_260)] dark:text-[oklch(0.8_0.05_260)]',
  'bg-[oklch(0.93_0.025_85)] text-[oklch(0.45_0.07_80)] dark:bg-[oklch(0.32_0.03_85)] dark:text-[oklch(0.82_0.06_85)]',
] as const

function toneFor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return FALLBACK_TONES[Math.abs(h) % FALLBACK_TONES.length]
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
}

interface AvatarProps extends React.ComponentProps<typeof AvatarPrimitive.Root> {
  name: string
  src?: string
}

function Avatar({ className, name, src, ...props }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn('relative flex size-10 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    >
      {src ? <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback
        className={cn(
          'flex size-full items-center justify-center font-display text-[0.82em] font-semibold',
          toneFor(name),
        )}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}

export { Avatar }
