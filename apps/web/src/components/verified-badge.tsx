import { BadgeCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Бейдж верификации личности/юрлица */
export function VerifiedBadge({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-accent', className)}
      title="Личность подтверждена"
    >
      <BadgeCheck className="size-[1.15em]" aria-hidden />
      {label ? <span className="text-[0.8em] font-semibold">{label}</span> : null}
      <span className="sr-only">Личность подтверждена</span>
    </span>
  )
}
