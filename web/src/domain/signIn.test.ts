import { describe, expect, it } from 'vitest'
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
  it('falls back to "Active Member" when start/expiry are missing', () => {
    expect(passLabel(null, null)).toBe('Active Member')
  })

  it('labels a 1-month pass', () => {
    expect(passLabel('2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z')).toBe('1-Month Pass')
  })

  it('labels a 4-month pass', () => {
    expect(passLabel('2026-01-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z')).toBe('4-Month Pass')
  })

  it('labels an annual pass', () => {
    expect(passLabel('2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z')).toBe('Annual Pass')
  })
})
