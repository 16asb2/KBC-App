import type { AccessPassId, UserProfile } from '@/types/member'

/**
 * The dated memberships — the passes that run for a period and grant entry on
 * their own. Punch passes and drop-ins are access too, but per visit, so they
 * carry no months and live outside this list.
 */
export const PASS_OPTIONS = [
  { id: 'annual', label: 'Annual pass', months: 12 },
  { id: '8month', label: '8-month pass', months: 8 },
  { id: '4month', label: '4-month pass', months: 4 },
  { id: '1month', label: '1-month pass', months: 1 },
] as const

export type DatedPassId = (typeof PASS_OPTIONS)[number]['id']

export const ACCESS_PASS_LABELS: Record<AccessPassId, string> = {
  annual: 'Annual pass',
  '8month': '8-month pass',
  '4month': '4-month pass',
  '1month': '1-month pass',
  punch: 'Punch pass',
  dropin: 'Drop-in',
  none: 'No pass',
}

/** The pass's name, for anywhere a person reads it. */
export function accessPassLabel(pass: AccessPassId): string {
  return ACCESS_PASS_LABELS[pass] ?? 'Access pass'
}

/** True for the passes that run between two dates. */
export function isDatedPass(pass: AccessPassId): pass is DatedPassId {
  return PASS_OPTIONS.some((p) => p.id === pass)
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

/**
 * Whether the member's pass admits them on its own, right now.
 *
 * A pass they hold but an admin has not confirmed does not, which is the whole
 * point of `membershipConfirmed` — a member can record their own purchase, but
 * cannot let themselves in with it.
 */
export function membershipGrantsEntry(
  profile: Pick<UserProfile, 'membershipAccessPass' | 'membershipConfirmed'>,
): boolean {
  return isDatedPass(profile.membershipAccessPass) && profile.membershipConfirmed
}

/**
 * The dated pass a start/expiry pair describes.
 *
 * The pass is stored on the profile now rather than inferred from its length,
 * so this is only for reading a period that arrived without one — a CSV import
 * row carrying two dates and no pass column. Kept in step with the same
 * bucketing in `admin-web/index.html`.
 */
export function passFromDates(start: string | null, expiry: string | null): AccessPassId {
  if (!start || !expiry) return 'none'
  const months = Math.round(
    (new Date(expiry).getTime() - new Date(start).getTime()) / (30.44 * 24 * 60 * 60 * 1000),
  )
  if (months >= 11) return 'annual'
  if (months >= 7) return '8month'
  if (months >= 3) return '4month'
  if (months >= 1) return '1month'
  return 'none'
}
