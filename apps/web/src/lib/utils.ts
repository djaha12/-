import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const SOM_PER_USD = 87.4 // мок; в проде — курс НБКР из БД

export function formatSom(value: number, som = 'сом'): string {
  return `${new Intl.NumberFormat('ru-RU').format(value)} ${som}`
}

export function formatBudgetRange(
  fromSom: number,
  toSom: number,
  labels?: { som?: string },
): {
  som: string
  usd: string
} {
  const fmt = new Intl.NumberFormat('ru-RU')
  const usdFrom = Math.round(fromSom / SOM_PER_USD / 100) * 100
  const usdTo = Math.round(toSom / SOM_PER_USD / 100) * 100
  return {
    som: `${fmt.format(fromSom)}–${fmt.format(toSom)} ${labels?.som ?? 'сом'}`,
    usd: `≈ $${fmt.format(usdFrom)}–${fmt.format(usdTo)}`,
  }
}

export function formatDealPrice(
  price: number,
  opts?: { monthly?: boolean; labels?: { som?: string; somMonthly?: string; perMonthShort?: string } },
): {
  som: string
  usd: string
} {
  const fmt = new Intl.NumberFormat('ru-RU')
  // месячные ставки округляем точнее: на аренде сотни дают до ±10% ошибки
  const step = opts?.monthly ? 10 : 100
  const usd = Math.round(price / SOM_PER_USD / step) * step
  const suffix = opts?.monthly
    ? ` ${opts?.labels?.somMonthly ?? 'сом/мес'}`
    : ` ${opts?.labels?.som ?? 'сом'}`
  return {
    som: `${fmt.format(price)}${suffix}`,
    usd: `≈ $${fmt.format(usd)}${opts?.monthly ? (opts?.labels?.perMonthShort ?? '/мес') : ''}`,
  }
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

export function timeAgo(d: Date | null): string {
  if (!d) return ''
  const mins = Math.floor((Date.now() - d.getTime()) / 6e4)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч`
  return `${Math.floor(hours / 24)} дн`
}
