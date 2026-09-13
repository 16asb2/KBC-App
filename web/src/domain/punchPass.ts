/**
 * Punches, and the halves of one.
 *
 * A full visit costs a whole punch; a half-day visit costs half of one. So
 * `punchPassRemaining` is a number that may carry a half — 4.5 is a real
 * balance on a real profile, not a corrupt one — and every place that spends,
 * gates on, or prints a punch count goes through here rather than assuming an
 * integer and rendering "4.5 punches" as "4" or "4.5 punchs".
 *
 * Halves are exactly representable in binary floating point, so repeated
 * halving never drifts on its own. `normalizePunches` is here for the values
 * that arrive from outside the app instead: an admin typing into the panel's
 * punch field, or a CSV column reading `4.3`.
 */

/** A visit's price in punches. Only these two — there is no quarter punch. */
export const FULL_PUNCH = 1 as const
export const HALF_PUNCH = 0.5 as const

export type PunchCost = typeof FULL_PUNCH | typeof HALF_PUNCH

/** Snap a balance to whole halves, never below zero. */
export function normalizePunches(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 2) / 2
}

/** Whether this balance covers a visit at `cost`. */
export function canSpendPunches(remaining: number, cost: PunchCost): boolean {
  return normalizePunches(remaining) >= cost
}

/** Whether anything on this balance still admits a visit — a half counts. */
export function hasPunchesLeft(remaining: number): boolean {
  return canSpendPunches(remaining, HALF_PUNCH)
}

/** The balance after a visit at `cost`. Clamped: it never goes negative. */
export function spendPunches(remaining: number, cost: PunchCost): number {
  return normalizePunches(normalizePunches(remaining) - cost)
}

/** Just the number: "4", "4.5" — a whole balance prints no pointless ".0". */
export function formatPunchCount(n: number): string {
  const v = normalizePunches(n)
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/** "1 punch", "4.5 punches", "0.5 punches" — only exactly one is singular. */
export function formatPunches(n: number): string {
  const v = normalizePunches(n)
  return `${formatPunchCount(v)} punch${v === 1 ? '' : 'es'}`
}

/** What the sign-in book calls this kind of punch. */
export function punchPassName(cost: PunchCost): string {
  return cost === HALF_PUNCH ? 'Half Punch Pass' : 'Punch Pass'
}

/**
 * The sign-in book's access type for a punch visit, with the balance it left.
 *
 * Both names contain "punch", which is what `accessKind` in signInBook.ts
 * matches on — so a half punch is coloured as a punch, not read as a
 * membership by the "pass" in its name.
 */
export function punchAccessType(cost: PunchCost, remaining: number): string {
  return `${punchPassName(cost)} (${formatPunchCount(remaining)} left)`
}
