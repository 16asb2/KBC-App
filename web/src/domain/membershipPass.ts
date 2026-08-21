export const PASS_OPTIONS = [
  { id: 'annual', label: 'Annual pass', months: 12 },
  { id: '8month', label: '8-month pass', months: 8 },
  { id: '4month', label: '4-month pass', months: 4 },
  { id: '1month', label: '1-month pass', months: 1 },
] as const

export type PassId = (typeof PASS_OPTIONS)[number]['id'] | 'inactive'

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

/** Derives the closest PassId from a start/expiry date pair. */
export function getPassId(start: string | null, expiry: string | null): PassId {
  if (!start || !expiry) return 'inactive'
  const months = Math.round(
    (new Date(expiry).getTime() - new Date(start).getTime()) / (30.44 * 24 * 60 * 60 * 1000),
  )
  if (months >= 11) return 'annual'
  if (months >= 7) return '8month'
  if (months >= 3) return '4month'
  if (months >= 1) return '1month'
  return 'inactive'
}

/** Derives the human-readable pass label from start/expiry dates (e.g. "Annual pass"). */
export function getPassLabel(start: string | null, expiry: string | null): string {
  const id = getPassId(start, expiry)
  return PASS_OPTIONS.find((p) => p.id === id)?.label ?? 'Access pass'
}
