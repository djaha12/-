'use client'

import Image from 'next/image'
import Link from 'next/link'
import { BadgeCheck, Bookmark } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { SaveButton } from '@/components/save-button'
import type { CaseItem } from '@/mock/data'
import { useI18n } from '@/i18n/client'
import { dealOutcomeLabel, dealTypeLabel } from '@/lib/deal-labels'
import { cn, formatBudgetRange, formatDealPrice } from '@/lib/utils'

interface CaseCardProps {
  item: CaseItem
  /** в профиле автора подпись избыточна — показываем район */
  hideAuthor?: boolean
  /** natural — masonry-лента; fixed — ровные сетки (похожие проекты) */
  frame?: 'natural' | 'fixed'
}

export function CaseCard({ item, hideAuthor = false, frame = 'natural' }: CaseCardProps) {
  const image = item.image
  const { t } = useI18n()
  const money = { som: t.caseCard.som, somMonthly: t.caseCard.somMonthly, perMonthShort: t.caseCard.perMonthShort }

  return (
    <article className={cn('group', frame === 'natural' && 'mb-5 break-inside-avoid')}>
      <div
        className={cn(
          'relative overflow-hidden rounded-xl bg-surface-muted',
          frame === 'fixed' && 'aspect-[4/3]',
        )}
      >
        <Link href={`/case/${item.slug}`} aria-label={item.title}>
          {frame === 'fixed' ? (
            <Image
              src={image.src}
              alt={item.title}
              fill
              placeholder="blur"
              blurDataURL={image.blurDataURL}
              sizes="(max-width: 1024px) 50vw, 280px"
              className="object-cover transition-transform duration-300 ease-(--ease-soft) group-hover:scale-[1.025]"
            />
          ) : (
            <Image
              src={image.src}
              alt={item.title}
              width={image.width}
              height={image.height}
              placeholder="blur"
              blurDataURL={image.blurDataURL}
              sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw"
              className="block w-full transition-transform duration-300 ease-(--ease-soft) group-hover:scale-[1.025]"
            />
          )}
          <span
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            aria-hidden
          />
        </Link>
        <span className="absolute top-3 right-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
          <SaveButton floating caseSlug={item.slug} defaultSaved={item.savedByMe} />
        </span>
        {item.deal ? (
          // итог сделки виден всегда — это и есть контент карточки риелтора;
          // подтверждённая клиентом — зелёная пилюля, самопубликация — нейтральная
          dealOutcomeLabel(t, item.deal) ? (
            <span
              className={cn(
                'pointer-events-none absolute bottom-3 left-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white ring-1 ring-white/15 backdrop-blur-sm',
                // контраст 12px-текста на светлых фото: скрим плотнее, чем у hover-чипов
                item.deal.confirmed ? 'bg-[oklch(0.46_0.085_155)]/90' : 'bg-black/70',
              )}
            >
              {item.deal.confirmed ? <BadgeCheck className="size-4" aria-hidden /> : null}
              {dealOutcomeLabel(t, item.deal)}
              {item.deal.confirmed ? (
                <span className="sr-only">{t.caseCard.confirmedSr}</span>
              ) : null}
            </span>
          ) : null
        ) : item.styles[0] ? (
          <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1 text-xs font-medium text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
            {item.styles[0]}
          </span>
        ) : null}
      </div>

      <div className="mt-2.5 px-0.5">
        <Link
          href={`/case/${item.slug}`}
          className="line-clamp-2 text-[15px] leading-snug font-semibold hover:underline"
        >
          {item.title}
        </Link>
        {item.deal ? (
          <p className="mt-1 text-[13px]">
            {item.deal.price ? (
              <>
                <span className="font-semibold">
                  {formatDealPrice(item.deal.price, { monthly: item.deal.type === 'rentOut', labels: money }).som}
                </span>
                <span className="text-muted-foreground max-sm:hidden">
                  {' '}
                  {formatDealPrice(item.deal.price, { monthly: item.deal.type === 'rentOut', labels: money }).usd}
                </span>
                <span className="text-muted-foreground"> · {dealTypeLabel(t, item.deal.type)}</span>
              </>
            ) : item.deal.priceFrom && item.deal.priceTo ? (
              // видимость RANGE: публикуется только вилка
              <>
                <span className="font-semibold">
                  {formatBudgetRange(item.deal.priceFrom, item.deal.priceTo, { som: t.caseCard.som }).som}
                </span>
                <span className="text-muted-foreground"> · {dealTypeLabel(t, item.deal.type)}</span>
              </>
            ) : item.deal.type === 'buyAssist' ? (
              // buyAssist: бейдж «Подбор выполнен» уже назвал тип — без повторов
              <span className="text-muted-foreground">{t.caseCard.forClientTask}</span>
            ) : (
              <span className="text-muted-foreground">
                {t.caseCard.priceHidden} · {dealTypeLabel(t, item.deal.type)}
              </span>
            )}
          </p>
        ) : null}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          {hideAuthor ? (
            <span className="truncate text-[13px] text-muted-foreground">{item.location}</span>
          ) : (
            <Link
              href={`/s/${item.specialistSlug}`}
              className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground sm:gap-2"
            >
              {/* на 390 в 2 колонки аватар съедает имя — носитель доверия важнее */}
              <Avatar name={item.authorName} className="size-6 text-[10px] max-sm:hidden" />
              <span className="truncate">{item.authorName}</span>
            </Link>
          )}
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <Bookmark className="size-3.5" aria-hidden />
            {item.saves}
          </span>
        </div>
      </div>
    </article>
  )
}
