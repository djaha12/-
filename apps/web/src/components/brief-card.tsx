import Link from 'next/link'
import { MessageSquareText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { BriefListItem } from '@/server/data'
import { formatBudgetRange, plural, timeAgo } from '@/lib/utils'

/**
 * Строка брифа в списке. variant='feed' — лента специалиста (счётчик откликов,
 * «вы откликнулись»); variant='mine' — список клиента (статус, отклики — призыв открыть).
 */
export function BriefCard({ brief, variant }: { brief: BriefListItem; variant: 'feed' | 'mine' }) {
  const meta = [
    brief.objectTypeLabel,
    brief.districtName,
    brief.budgetMin && brief.budgetMax
      ? formatBudgetRange(brief.budgetMin, brief.budgetMax).som
      : null,
  ].filter(Boolean)

  return (
    <li>
      <Link
        href={`/briefs/${brief.id}`}
        className="block px-4 py-4 transition-colors hover:bg-surface-muted/60 sm:px-5"
      >
        <span className="flex items-start justify-between gap-3">
          {/* заголовок несёт смысл задачи — не обрезаем в одну строку */}
          <span className="line-clamp-2 min-w-0 font-semibold">{brief.title}</span>
          <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">
            {timeAgo(brief.createdAt)}
          </span>
        </span>
        <span className="mt-1 block text-[13px] text-muted-foreground">{meta.join(' · ')}</span>
        {brief.description ? (
          <span className="mt-1.5 line-clamp-2 block text-sm leading-relaxed text-muted-foreground">
            {brief.description}
          </span>
        ) : null}
        <span className="mt-2.5 flex items-center gap-2">
          {variant === 'mine' ? (
            <Badge variant={brief.status === 'OPEN' ? 'success' : 'neutral'} size="sm">
              {brief.status === 'OPEN' ? 'Открыт' : 'Закрыт'}
            </Badge>
          ) : null}
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <MessageSquareText className="size-3.5" aria-hidden />
            {brief.responsesCount > 0
              ? `${brief.responsesCount} ${plural(brief.responsesCount, 'отклик', 'отклика', 'откликов')}`
              : 'Откликов пока нет'}
          </span>
          {variant === 'feed' && brief.iResponded ? (
            <Badge variant="success" size="sm">
              Вы откликнулись
            </Badge>
          ) : null}
        </span>
      </Link>
    </li>
  )
}
