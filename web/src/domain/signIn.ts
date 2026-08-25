import { getPassLabel } from './membershipPass'

/** True if the given ISO timestamp falls on the same calendar day as `now`. */
export function isSameDay(iso: string, now: Date = new Date()): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

/** One sign-in per calendar day, per member. */
export function hasSignedInToday(
  lastSignInAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return !!lastSignInAt && isSameDay(lastSignInAt, now)
}

/**
 * Label shown in the sign-in book for a membership sign-in.
 *
 * Names the pass, never the status. "Active Member" used to be the answer
 * whenever the dates were missing or under a month, which told a supervisor
 * reading the book nothing about what the person actually holds — and claimed
 * they were active even while their purchase was still pending confirmation.
 *
 * The month-bucketing this used to do itself was a second copy of
 * `getPassId`, differing only in capitalisation. It delegates now, so the
 * sign-in book and the member directory cannot drift apart.
 */
export function passLabel(start: string | null, expiry: string | null): string {
  return getPassLabel(start, expiry)
}
