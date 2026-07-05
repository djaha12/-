import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Пустое состояние всегда продаёт действие (ТЗ: UX-детали) */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
}: {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent-soft-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      {actionLabel ? <Button className="mt-2">{actionLabel}</Button> : null}
    </div>
  )
}
