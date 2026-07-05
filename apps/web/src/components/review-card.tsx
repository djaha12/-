import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { RatingStars } from '@/components/rating-stars'
import type { Review } from '@/mock/data'

const SUBSCALES: Array<{ key: keyof Pick<Review, 'quality' | 'timing' | 'communication' | 'budget'>; label: string }> = [
  { key: 'quality', label: 'Качество' },
  { key: 'timing', label: 'Сроки' },
  { key: 'communication', label: 'Общение' },
  { key: 'budget', label: 'Бюджет' },
]

export function ReviewCard({
  review,
  trustLabel = 'Заказ выполнен через Ателье',
}: {
  review: Review
  trustLabel?: string
}) {
  const overall = (review.quality + review.timing + review.communication + review.budget) / 4
  return (
    <article className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={review.author} className="size-10" />
          <div>
            <p className="text-sm font-semibold">{review.author}</p>
            <p className="text-xs text-muted-foreground">
              {review.date} · {review.caseTitle}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1.5">
          <RatingStars value={overall} />
          <span className="text-sm font-semibold">{overall.toFixed(1).replace('.', ',')}</span>
        </span>
      </div>

      <p className="mt-3.5 text-[15px] leading-relaxed text-foreground/90">{review.text}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {SUBSCALES.map(({ key, label }) => (
          <Badge key={key} variant="neutral">
            {label} {review[key]},0
          </Badge>
        ))}
        {/* маркер доверия: на 390 — своя строка, не пятая подшкала */}
        <Badge variant="success" className="ml-auto max-sm:mt-1 max-sm:ml-0 max-sm:basis-full">
          {trustLabel}
        </Badge>
      </div>
    </article>
  )
}
