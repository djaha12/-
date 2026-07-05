import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

export function RatingStars({
  value,
  className,
  size = 15,
}: {
  value: number
  className?: string
  size?: number
}) {
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      role="img"
      aria-label={`Оценка ${value} из 5`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={cn(
            i < Math.round(value) ? 'fill-warning text-warning' : 'fill-border text-border',
          )}
          aria-hidden
        />
      ))}
    </span>
  )
}
