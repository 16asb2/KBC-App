import type { AccessPassId, UserProfile } from '@/types/member'
import { isDatedPass } from './membershipPass'

type MembershipFields = Pick<UserProfile, 'membershipAccessPass' | 'membershipExpiry'>

/**
 * Pure decision function for the lapsed-membership auto-transition.
 * Returns the pass to transition to, or null if no change is needed.
 *
 * Rules:
 *  - If membershipExpiry is non-null and in the past → the pass becomes 'none'
 *  - Punch passes and drop-ins are per-visit and carry no expiry, so they are
 *    never transitioned here; spending a punch is what ends one
 */
export function nextAccessPass(
  profile: MembershipFields,
  now: Date = new Date(),
): AccessPassId | null {
  const expired = profile.membershipExpiry !== null && new Date(profile.membershipExpiry) < now

  if (expired && isDatedPass(profile.membershipAccessPass)) return 'none'
  return null
}
