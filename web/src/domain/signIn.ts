/** True if the given ISO timestamp falls on the same calendar day as `now`. */
export function isSameDay(iso: string, now: Date = new Date()): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  )
}

/** One sign-in per calendar day, per member. */
export function hasSignedInToday(lastSignInAt: string | null | undefined, now: Date = new Date()): boolean {
  return !!lastSignInAt && isSameDay(lastSignInAt, now)
}

/** Label shown in the sign-in log for an active/pending membership, derived from its length. */
export function passLabel(start: string | null, expiry: string | null): string {
  if (!start || !expiry) return 'Active Member'
  const months = Math.round(
    (new Date(expiry).getTime() - new Date(start).getTime()) / (30.44 * 24 * 60 * 60 * 1000),
  )
  if (months >= 11) return 'Annual Pass'
  if (months >= 7) return '8-Month Pass'
  if (months >= 3) return '4-Month Pass'
  if (months >= 1) return '1-Month Pass'
  return 'Active Member'
}
