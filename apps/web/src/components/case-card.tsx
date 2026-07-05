import Image from 'next/image'
import Link from 'next/link'
import { Bookmark } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { SaveButton } from '@/components/save-button'
import { img, specialistBySlug, type CaseItem } from '@/mock/data'

export function CaseCard({ item }: { item: CaseItem }) {
  const image = img(item.imageId)
  const author = specialistBySlug(item.specialistSlug)

  return (
    <article className="group mb-5 break-inside-avoid">
      <div className="relative overflow-hidden rounded-xl bg-surface-muted">
        <Link href={`/case/${item.slug}`} aria-label={item.title}>
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
          <span
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            aria-hidden
          />
        </Link>
        <span className="absolute top-3 right-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100">
          <SaveButton floating />
        </span>
        {item.styles[0] ? (
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
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <Link
            href={`/s/${author.slug}`}
            className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground"
          >
            <Avatar name={author.name} className="size-6 text-[10px]" />
            <span className="truncate">{author.name}</span>
          </Link>
          <span className="flex shrink-0 items-center gap-1 text-xs text-faint-foreground">
            <Bookmark className="size-3.5" aria-hidden />
            {item.saves}
          </span>
        </div>
      </div>
    </article>
  )
}
