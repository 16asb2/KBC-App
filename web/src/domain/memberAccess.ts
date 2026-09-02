import type { UserProfile, WaiverRecord } from '@/types/member'
import { isDatedPass } from './membershipPass'

// What a member's own record says about their access, read rather than written.
//
// The members screen shows this to a supervisor looking at somebody else; the
// profile screen shows it to the person it belongs to. Neither is the place to
// re-derive "is this pass any good" out of four loosely related fields, so the
// reading happens once, here, where it can be tested.

/**
 * A purchase a member recorded that an admin has yet to confirm.
 *
 * Stored as a JSON *string* on the profile, not a map — see the data-format
 * constraint in web/CLAUDE.md. Anything unparseable reads as absent: a pending
 * purchase is a note about money, and a half-written one is not worth showing
 * as though it were fact.
 */
export type PendingMembership = { label: string; price: string; start: string; expiry: string }

export function parsePendingMembership(raw: string | null | undefined): PendingMembership | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PendingMembership>
    if (!parsed || typeof parsed !== 'object') return null
    return {
      label: parsed.label ?? '',
      price: parsed.price ?? '',
      start: parsed.start ?? '',
      expiry: parsed.expiry ?? '',
    }
  } catch {
    return null
  }
}

/** A signed waiver off the profile, or null if it isn't there or won't parse. */
export function parseWaiver(raw: string | null | undefined): WaiverRecord | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<WaiverRecord>
    if (!parsed || typeof parsed !== 'object' || !parsed.signedAt) return null
    return {
      signedAt: parsed.signedAt,
      signedBy: parsed.signedBy ?? '',
      ...(parsed.guardian ? { guardian: parsed.guardian } : {}),
      ...(parsed.docUrl ? { docUrl: parsed.docUrl } : {}),
    }
  } catch {
    return null
  }
}

/**
 * Whole days from today until `iso`, negative once it is past.
 *
 * Counted between calendar days rather than between instants, so a pass that
 * runs out at 9am tomorrow is "1 day left" and not "0" — which is what the
 * member means by the question, and the difference between renewing today and
 * arriving to find they can't climb.
 */
export function daysUntil(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null
  const end = new Date(iso)
  if (Number.isNaN(end.getTime())) return null
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((midnight(end) - midnight(now)) / 86_400_000)
}

/**
 * Where the member's pass stands, in the terms they would use.
 *
 *   'none'    — nothing on the record admits them
 *   'expired' — a dated pass whose end date has gone by
 *   'pending' — bought, recorded, waiting on an admin to confirm the payment
 *   'active'  — theirs to use
 *
 * 'expired' is rare in practice and deliberately still here: `nextAccessPass`
 * clears a lapsed pass to 'none' when the profile loads, so this only shows on
 * a record that hasn't been through that yet. Reporting such a pass as active
 * would be the one wrong answer.
 *
 * Punch passes and drop-ins carry no dates — a punch ends by being spent — so
 * they are never expired here. The count says the rest.
 */
export type PassState = 'none' | 'expired' | 'pending' | 'active'

export function passState(
  profile: Pick<
    UserProfile,
    'membershipAccessPass' | 'membershipConfirmed' | 'membershipExpiry'
  >,
  now: Date = new Date(),
): PassState {
  if (profile.membershipAccessPass === 'none') return 'none'
  if (
    isDatedPass(profile.membershipAccessPass) &&
    profile.membershipExpiry &&
    new Date(profile.membershipExpiry) < now
  ) {
    return 'expired'
  }
  return profile.membershipConfirmed ? 'active' : 'pending'
}
