export type DateRange = { from: string; to: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_RANGE_DAYS = 90

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function shiftDays(date: string, delta: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return isoDay(d)
}

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !isNaN(d.getTime()) && isoDay(d) === s
}

function diffDays(from: string, to: string): number {
  return Math.round(
    (new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()) / 86400000,
  )
}

/**
 * Parse and validate from/to date inputs with defensive clamping.
 * - Both missing/invalid → fallback {today, today}
 * - from > to → swap
 * - to > today → clamp to today
 * - range > 90 days → clamp to last 90 days ending at `to`
 */
export function parseDateRange(
  fromInput: string | undefined,
  toInput: string | undefined,
  today: string = isoDay(new Date()),
): DateRange {
  if (!fromInput || !toInput) return { from: today, to: today }
  if (!isValidDate(fromInput) || !isValidDate(toInput)) return { from: today, to: today }

  let from = fromInput
  let to = toInput

  // Swap if reversed
  if (from > to) [from, to] = [to, from]

  // Clamp future
  if (to > today) to = today
  if (from > today) from = today

  // Clamp range size
  const totalDays = diffDays(from, to) + 1
  if (totalDays > MAX_RANGE_DAYS) {
    from = shiftDays(to, -(MAX_RANGE_DAYS - 1))
  }

  return { from, to }
}

export function rangeDays(range: DateRange): number {
  return diffDays(range.from, range.to) + 1
}
