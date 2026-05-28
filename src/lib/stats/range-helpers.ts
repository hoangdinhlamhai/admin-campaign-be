export type RangeKey = 'today' | '7d' | '30d'
export type DateRange = { from: string; to: string }

const DAYS: Record<RangeKey, number> = { today: 1, '7d': 7, '30d': 30 }

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function shiftDays(date: string, delta: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return isoDay(d)
}

export function parseRange(input: string | undefined): RangeKey {
  return input === '7d' || input === '30d' ? input : 'today'
}

export function rangeWindow(key: RangeKey, today: string = isoDay(new Date())): DateRange {
  const days = DAYS[key]
  return { from: shiftDays(today, -(days - 1)), to: today }
}

export function previousWindow(curr: DateRange): DateRange {
  const days = (new Date(curr.to + 'T00:00:00Z').getTime() - new Date(curr.from + 'T00:00:00Z').getTime()) / 86400000 + 1
  return { from: shiftDays(curr.from, -days), to: shiftDays(curr.from, -1) }
}

export function rangeDays(range: DateRange): number {
  return (new Date(range.to + 'T00:00:00Z').getTime() - new Date(range.from + 'T00:00:00Z').getTime()) / 86400000 + 1
}
