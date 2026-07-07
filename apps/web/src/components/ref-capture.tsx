'use client'

import { useEffect } from 'react'
import { captureRef } from '@/lib/attribution'

/**
 * Ловит ?ref= при входе (первое касание) для атрибуции заявки. Ссылки-визитки
 * приходят внешним переходом = полная загрузка, поэтому эффект на маунт
 * достаточен; useSearchParams не берём, чтобы не переводить все страницы в
 * динамический рендер. Ничего не рендерит.
 */
export function RefCapture() {
  useEffect(() => {
    captureRef()
  }, [])
  return null
}
