import { describe, expect, it } from 'vitest'
import { accessPassLabel } from './membershipPass'
import { hasSignedInToday, passLabel } from './signIn'

describe('hasSignedInToday', () => {
  const now = new Date('2026-06-15T18:00:00.000Z')

  it('is true for a timestamp earlier the same day', () => {
    expect(hasSignedInToday('2026-06-15T09:00:00.000Z', now)).toBe(true)
  })

  it('is false for a timestamp on a previous day', () => {
    expect(hasSignedInToday('2026-06-14T23:59:00.000Z', now)).toBe(false)
  })

  it('is false for null/undefined', () => {
    expect(hasSignedInToday(null, now)).toBe(false)
    expect(hasSignedInToday(undefined, now)).toBe(false)
  })
})

describe('passLabel', () => {
  it('never reports a status instead of a pass', () => {
    // "Active Member" said nothing about what the member holds, and claimed
    // active of a purchase still awaiting confirmation.
    for (const pass of ['annual', 'punch', 'none'] as const) {
      expect(passLabel(pass)).not.toMatch(/active|pending|inactive/i)
    }
  })

  it('labels each membership by its length', () => {
    expect(passLabel('1month')).toBe('1-month pass')
    expect(passLabel('4month')).toBe('4-month pass')
    expect(passLabel('annual')).toBe('Annual pass')
  })

  it('labels the per-visit passes too', () => {
    expect(passLabel('punch')).toBe('Punch pass')
    expect(passLabel('dropin')).toBe('Drop-in')
  })

  it('agrees with the label the member directory shows', () => {
    expect(passLabel('8month')).toBe(accessPassLabel('8month'))
  })
})
