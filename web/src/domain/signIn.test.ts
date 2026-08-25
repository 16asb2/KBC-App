import { describe, expect, it } from 'vitest'
import { getPassLabel } from './membershipPass'
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
    expect(passLabel(null, null)).not.toMatch(/active/i)
    expect(passLabel(null, null)).toBe('Access pass')
  })

  it('labels a 1-month pass', () => {
    expect(passLabel('2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z')).toBe('1-month pass')
  })

  it('labels a 4-month pass', () => {
    expect(passLabel('2026-01-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z')).toBe('4-month pass')
  })

  it('labels an annual pass', () => {
    expect(passLabel('2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z')).toBe('Annual pass')
  })

  it('agrees with the label the member directory shows', () => {
    const start = '2026-01-01T00:00:00.000Z'
    const expiry = '2026-09-01T00:00:00.000Z'
    expect(passLabel(start, expiry)).toBe(getPassLabel(start, expiry))
  })
})
