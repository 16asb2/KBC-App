import { describe, expect, it } from 'vitest'
import { nextAccessPass } from './membership'

const NOW = new Date('2026-06-01T00:00:00.000Z')
const PAST = '2026-05-01T00:00:00.000Z'
const FUTURE = '2026-07-01T00:00:00.000Z'

describe('nextAccessPass', () => {
  it('clears an expired annual pass', () => {
    expect(nextAccessPass({ membershipAccessPass: 'annual', membershipExpiry: PAST }, NOW)).toBe(
      'none',
    )
  })

  it('clears an expired 1-month pass', () => {
    expect(nextAccessPass({ membershipAccessPass: '1month', membershipExpiry: PAST }, NOW)).toBe(
      'none',
    )
  })

  it('leaves a pass that has not expired untouched', () => {
    expect(
      nextAccessPass({ membershipAccessPass: 'annual', membershipExpiry: FUTURE }, NOW),
    ).toBeNull()
  })

  it('leaves a member with no pass untouched, expired date or not', () => {
    expect(nextAccessPass({ membershipAccessPass: 'none', membershipExpiry: PAST }, NOW)).toBeNull()
  })

  it('leaves punch-pass and drop-in members untouched — they carry no expiry', () => {
    expect(nextAccessPass({ membershipAccessPass: 'punch', membershipExpiry: null }, NOW)).toBeNull()
    expect(
      nextAccessPass({ membershipAccessPass: 'dropin', membershipExpiry: null }, NOW),
    ).toBeNull()
  })

  it('does not transition a dated pass that has no expiry recorded', () => {
    expect(
      nextAccessPass({ membershipAccessPass: 'annual', membershipExpiry: null }, NOW),
    ).toBeNull()
  })
})
