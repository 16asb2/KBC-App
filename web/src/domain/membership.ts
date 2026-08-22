import type { MembershipStatus, UserProfile } from '@/types/member'

type MembershipFields = Pick<UserProfile, 'membershipStatus' | 'membershipExpiry'>

/**
 * Pure decision function for the membership-status auto-transition.
 * Returns the status to transition to, or null if no change is needed.
 *
 * Rules:
 *  - If membershipExpiry is non-null and in the past → transition to 'inactive'
 *  - Punch-pass-only users are NOT promoted to 'active' — punch passes grant
 *    per-visit access only; membershipStatus is untouched by this function
 */
export function nextMembershipStatus(
  profile: MembershipFields,
  now: Date = new Date(),
): MembershipStatus | null {
  const expired = profile.membershipExpiry !== null && new Date(profile.membershipExpiry) < now
  const wasPaid = profile.membershipStatus === 'active' || profile.membershipStatus === 'pending'

  if (expired && wasPaid) return 'inactive'
  return null
}
