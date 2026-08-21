import { describe, expect, it } from 'vitest'
import { nextMembershipStatus } from './membership'

const NOW = new Date('2026-06-01T00:00:00.000Z')
const PAST = '2026-05-01T00:00:00.000Z'
const FUTURE = '2026-07-01T00:00:00.000Z'

describe('nextMembershipStatus', () => {
  it('transitions active + expired to inactive', () => {
    expect(
      nextMembershipStatus({ membershipStatus: 'active', membershipExpiry: PAST }, NOW),
    ).toBe('inactive')
  })

  it('transitions pending + expired to inactive', () => {
    expect(
      nextMembershipStatus({ membershipStatus: 'pending', membershipExpiry: PAST }, NOW),
    ).toBe('inactive')
  })

  it('leaves active + not-yet-expired untouched', () => {
    expect(
      nextMembershipStatus({ membershipStatus: 'active', membershipExpiry: FUTURE }, NOW),
    ).toBeNull()
  })

  it('leaves already-inactive + expired untouched (no-op, already inactive)', () => {
    expect(
      nextMembershipStatus({ membershipStatus: 'inactive', membershipExpiry: PAST }, NOW),
    ).toBeNull()
  })

  it('leaves null-expiry (punch-pass-only) members untouched regardless of status', () => {
    expect(
      nextMembershipStatus({ membershipStatus: 'active', membershipExpiry: null }, NOW),
    ).toBeNull()
    expect(
      nextMembershipStatus({ membershipStatus: 'inactive', membershipExpiry: null }, NOW),
    ).toBeNull()
  })
})
