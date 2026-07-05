import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const SOM_PER_USD = 87.4 // мок; в проде — курс НБКР из БД

export function formatSom(value: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(value)} сом`
}

export function formatBudgetRange(fromSom: number, toSom: number): {
  som: string
  usd: string
} {
  const fmt = new Intl.NumberFormat('ru-RU')
  const usdFrom = Math.round(fromSom / SOM_PER_USD / 100) * 100
  const usdTo = Math.round(toSom / SOM_PER_USD / 100) * 100
  return {
    som: `${fmt.format(fromSom)}–${fmt.format(toSom)} сом`,
    usd: `≈ $${fmt.format(usdFrom)}–${fmt.format(usdTo)}`,
  }
}

export function formatDealPrice(price: number, opts?: { monthly?: boolean }): {
  som: string
  usd: string
} {
  const fmt = new Intl.NumberFormat('ru-RU')
  // месячные ставки округляем точнее: на аренде сотни дают до ±10% ошибки
  const step = opts?.monthly ? 10 : 100
  const usd = Math.round(price / SOM_PER_USD / step) * step
  const suffix = opts?.monthly ? ' сом/мес' : ' сом'
  return {
    som: `${fmt.format(price)}${suffix}`,
    usd: `≈ $${fmt.format(usd)}${opts?.monthly ? '/мес' : ''}`,
  }
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}
