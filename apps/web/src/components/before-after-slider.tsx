'use client'

import * as React from 'react'
import { useI18n } from '@/i18n/client'
import Image from 'next/image'
import { ChevronsLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Img {
  src: string
  width: number
  height: number
  blurDataURL: string
}

/** Иммерсивный «до/после»: перетаскивание ползунка, клавиатура ←/→, тач */
export function BeforeAfterSlider({
  before,
  after,
  className,
}: {
  before: Img
  after: Img
  className?: string
}) {
  const { t } = useI18n()
  const [pos, setPos] = React.useState(50)
  const ref = React.useRef<HTMLDivElement>(null)
  const dragging = React.useRef(false)

  const updateFromClientX = React.useCallback((clientX: number) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const next = ((clientX - rect.left) / rect.width) * 100
    setPos(Math.min(98, Math.max(2, next)))
  }, [])

  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (dragging.current) updateFromClientX(e.clientX)
    }
    const onUp = () => {
      dragging.current = false
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    // touch-pan-y: вертикальный скролл шлёт pointercancel вместо pointerup
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [updateFromClientX])

  return (
    <div
      ref={ref}
      className={cn(
        'group relative touch-pan-y overflow-hidden rounded-xl select-none',
        className,
      )}
      onPointerDown={(e) => {
        dragging.current = true
        updateFromClientX(e.clientX)
      }}
    >
      <Image
        src={after.src}
        alt={t.slider.after}
        width={after.width}
        height={after.height}
        placeholder="blur"
        blurDataURL={after.blurDataURL}
        className="block w-full"
        sizes="(max-width: 768px) 100vw, 900px"
      />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        aria-hidden
      >
        <Image
          src={before.src}
          alt=""
          width={before.width}
          height={before.height}
          placeholder="blur"
          blurDataURL={before.blurDataURL}
          className="block w-full"
          sizes="(max-width: 768px) 100vw, 900px"
        />
      </div>

      <div className="absolute top-0 bottom-0" style={{ left: `${pos}%` }} aria-hidden>
        <div className="absolute top-0 bottom-0 -ml-px w-0.5 bg-white/90 shadow-float" />
        <button
          type="button"
          role="slider"
          aria-label={t.slider.compareAria}
          aria-valuemin={2}
          aria-valuemax={98}
          aria-valuenow={Math.round(pos)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setPos((p) => Math.max(2, p - 4))
            if (e.key === 'ArrowRight') setPos((p) => Math.min(98, p + 4))
            if (e.key === 'Home') setPos(2)
            if (e.key === 'End') setPos(98)
          }}
          className="absolute top-1/2 -translate-1/2 flex size-11 cursor-ew-resize items-center justify-center rounded-full bg-white text-[#2A2521] shadow-float transition-transform duration-150 hover:scale-105"
        >
          <ChevronsLeftRight className="size-5" aria-hidden />
        </button>
      </div>

      <span className="absolute top-4 left-4 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
        {t.slider.before}
      </span>
      <span className="absolute top-4 right-4 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
        {t.slider.after}
      </span>
    </div>
  )
}
