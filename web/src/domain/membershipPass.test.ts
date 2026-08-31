import { describe, expect, it } from 'vitest'
import {
  accessPassLabel,
  isDatedPass,
  membershipGrantsEntry,
  passFromDates,
} from './membershipPass'

describe('accessPassLabel', () => {
  it('names every pass a member can hold', () => {
    expect(accessPassLabel('annual')).toBe('Annual pass')
    expect(accessPassLabel('8month')).toBe('8-month pass')
    expect(accessPassLabel('4month')).toBe('4-month pass')
    expect(accessPassLabel('1month')).toBe('1-month pass')
    expect(accessPassLabel('punch')).toBe('Punch pass')
    expect(accessPassLabel('dropin')).toBe('Drop-in')
    expect(accessPassLabel('none')).toBe('No pass')
  })

  it('never answers with a status word', () => {
    for (const pass of ['annual', 'punch', 'none'] as const) {
      expect(accessPassLabel(pass)).not.toMatch(/active|pending|inactive/i)
    }
  })
})

describe('isDatedPass', () => {
  it('is true only for the passes that run for a period', () => {
    expect(isDatedPass('annual')).toBe(true)
    expect(isDatedPass('1month')).toBe(true)
    expect(isDatedPass('punch')).toBe(false)
    expect(isDatedPass('dropin')).toBe(false)
    expect(isDatedPass('none')).toBe(false)
  })
})

describe('membershipGrantsEntry', () => {
  it('admits a confirmed dated pass', () => {
    expect(membershipGrantsEntry({ membershipAccessPass: 'annual', membershipConfirmed: true })).toBe(
      true,
    )
  })

  it('refuses a pass the member recorded but no admin has confirmed', () => {
    expect(
      membershipGrantsEntry({ membershipAccessPass: 'annual', membershipConfirmed: false }),
    ).toBe(false)
  })

  it('refuses punch and drop-in — those are spent per visit, not a membership', () => {
    expect(membershipGrantsEntry({ membershipAccessPass: 'punch', membershipConfirmed: true })).toBe(
      false,
    )
    expect(
      membershipGrantsEntry({ membershipAccessPass: 'dropin', membershipConfirmed: true }),
    ).toBe(false)
  })

  it('refuses a member with no pass', () => {
    expect(membershipGrantsEntry({ membershipAccessPass: 'none', membershipConfirmed: true })).toBe(
      false,
    )
  })
})

describe('passFromDates', () => {
  it('returns none when either date is missing', () => {
    expect(passFromDates(null, null)).toBe('none')
    expect(passFromDates('2026-01-01T00:00:00.000Z', null)).toBe('none')
  })

  it('buckets a period to the pass it describes', () => {
    expect(passFromDates('2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z')).toBe('1month')
    expect(passFromDates('2026-01-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z')).toBe('4month')
    expect(passFromDates('2026-01-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).toBe('8month')
    expect(passFromDates('2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z')).toBe('annual')
  })

  it('returns none for a period shorter than a month', () => {
    expect(passFromDates('2026-01-01T00:00:00.000Z', '2026-01-05T00:00:00.000Z')).toBe('none')
  })
})
