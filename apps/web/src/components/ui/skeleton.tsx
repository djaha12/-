import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-surface-muted', className)}
      aria-hidden
      {...props}
    />
  )
}

export { Skeleton }
