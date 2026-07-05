import * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        'h-11 w-full rounded-full border border-border bg-surface px-4 text-sm text-foreground transition-colors duration-150',
        'placeholder:text-faint-foreground',
        'hover:border-border-strong focus:border-border-strong focus:outline-none focus-visible:outline-2 focus-visible:outline-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
