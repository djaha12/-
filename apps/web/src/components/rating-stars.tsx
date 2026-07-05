import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Честная дробная заливка: 4,8 не выглядит как 5,0 */
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
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.min(1, Math.max(0, value - i))
        return (
          <span key={i} className="relative inline-flex" style={{ width: size, height: size }}>
            <Star
              style={{ width: size, height: size }}
              className="fill-border text-border"
              aria-hidden
            />
            {fill > 0 ? (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
                aria-hidden
              >
                <Star
                  style={{ width: size, height: size }}
                  className="fill-warning text-warning"
                />
              </span>
            ) : null}
          </span>
        )
      })}
    </span>
  )
}
