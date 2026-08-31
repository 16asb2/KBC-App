import { accessPassLabel } from './membershipPass'
import type { AccessPassId } from '@/types/member'

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
 * The pass is now stored on the profile rather than inferred from the gap
 * between two dates, so this reads it straight off and cannot disagree with
 * what the member directory shows.
 */
export function passLabel(pass: AccessPassId): string {
  return accessPassLabel(pass)
}
