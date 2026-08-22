import { describe, expect, it } from 'vitest'
import { getPassId, getPassLabel } from './membershipPass'

describe('getPassId', () => {
  it('returns inactive when start/expiry are missing', () => {
    expect(getPassId(null, null)).toBe('inactive')
  })

  it('identifies a 1-month pass', () => {
    expect(getPassId('2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z')).toBe('1month')
  })

  it('identifies an annual pass', () => {
    expect(getPassId('2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z')).toBe('annual')
  })
})

describe('getPassLabel', () => {
  it('labels an 8-month pass', () => {
    expect(getPassLabel('2026-01-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).toBe('8-month pass')
  })

  it('falls back to Access pass for an unrecognized id', () => {
    expect(getPassLabel(null, null)).toBe('Access pass')
  })
})
