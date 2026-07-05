/** Шаг округления вилки цены сделки, сомы */
export const PRICE_RANGE_STEP_SOM = 10_000

/**
 * Вилка из точной цены (видимость RANGE).
 * Инвариант 03/§13: вилка НИКОГДА не совпадает с точной ценой и не вырождается
 * в точку — иначе публикация вилки раскрывает точную цену (мелкие суммы аренды).
 */
export function derivePriceRange(exact: number): { min: number; max: number } {
  const step = PRICE_RANGE_STEP_SOM
  let min = Math.floor((exact * 0.95) / step) * step
  let max = Math.ceil((exact * 1.05) / step) * step
  if (min === max) {
    min -= step
    max += step
  }
  if (min === exact) min -= step
  if (max === exact) max += step
  return { min: Math.max(0, min), max }
}
