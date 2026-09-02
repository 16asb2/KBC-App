import { describe, expect, it } from 'vitest'
import { daysUntil, parsePendingMembership, parseWaiver, passState } from './memberAccess'

const NOW = new Date('2026-06-15T12:00:00.000Z')

describe('parsePendingMembership', () => {
  it('reads a recorded purchase', () => {
    const raw = JSON.stringify({
      label: 'Annual pass',
      price: '$300',
      start: '2026-06-01T00:00:00.000Z',
      expiry: '2027-06-01T00:00:00.000Z',
    })
    expect(parsePendingMembership(raw)?.label).toBe('Annual pass')
  })

  it('treats absent, empty and malformed alike', () => {
    expect(parsePendingMembership(null)).toBeNull()
    expect(parsePendingMembership('')).toBeNull()
    expect(parsePendingMembership('{not json')).toBeNull()
    expect(parsePendingMembership('"a string"')).toBeNull()
  })
})

describe('parseWaiver', () => {
  it('reads a signed waiver', () => {
    const raw = JSON.stringify({ signedAt: '2026-01-02T00:00:00.000Z', signedBy: 'Jane Smith' })
    expect(parseWaiver(raw)).toEqual({
      signedAt: '2026-01-02T00:00:00.000Z',
      signedBy: 'Jane Smith',
    })
  })

  it('keeps a guardian signature', () => {
    const raw = JSON.stringify({ signedAt: 'x', signedBy: 'Kid', guardian: 'Parent' })
    expect(parseWaiver(raw)?.guardian).toBe('Parent')
  })

  it('is null without a signing date — there is nothing to show', () => {
    expect(parseWaiver(JSON.stringify({ signedBy: 'Jane Smith' }))).toBeNull()
    expect(parseWaiver(undefined)).toBeNull()
    expect(parseWaiver('{')).toBeNull()
  })
})

describe('daysUntil', () => {
  // Local dates on both sides, since the boundary this counts to is midnight
  // where the member is — the same local-time reading the rest of the app takes
  // (see utils/datetime.ts). Built with the Date constructor rather than parsed
  // out of a Z-suffixed string, or these would only hold in UTC.
  it('counts calendar days, not elapsed hours', () => {
    // 9am tomorrow is less than 24 hours away and is still a day left.
    const lateTonight = new Date(2026, 5, 15, 23, 0)
    expect(daysUntil(new Date(2026, 5, 16, 9, 0).toISOString(), lateTonight)).toBe(1)
    // Later the same day is not another day.
    const earlyToday = new Date(2026, 5, 15, 0, 1)
    expect(daysUntil(new Date(2026, 5, 15, 23, 59).toISOString(), earlyToday)).toBe(0)
  })

  it('goes negative once the date is past', () => {
    expect(daysUntil('2026-06-10T12:00:00.000Z', NOW)).toBe(-5)
  })

  it('is null for a date that is missing or unreadable', () => {
    expect(daysUntil(null, NOW)).toBeNull()
    expect(daysUntil('not a date', NOW)).toBeNull()
  })
})

describe('passState', () => {
  it('is none when nothing admits them', () => {
    expect(
      passState(
        { membershipAccessPass: 'none', membershipConfirmed: true, membershipExpiry: null },
        NOW,
      ),
    ).toBe('none')
  })

  it('is active for a confirmed pass that is still running', () => {
    expect(
      passState(
        {
          membershipAccessPass: 'annual',
          membershipConfirmed: true,
          membershipExpiry: '2026-12-01T00:00:00.000Z',
        },
        NOW,
      ),
    ).toBe('active')
  })

  it('is pending while an admin has yet to confirm the payment', () => {
    expect(
      passState(
        {
          membershipAccessPass: 'annual',
          membershipConfirmed: false,
          membershipExpiry: '2026-12-01T00:00:00.000Z',
        },
        NOW,
      ),
    ).toBe('pending')
  })

  it('is expired past the end date, confirmed or not', () => {
    for (const membershipConfirmed of [true, false]) {
      expect(
        passState(
          {
            membershipAccessPass: '4month',
            membershipConfirmed,
            membershipExpiry: '2026-05-01T00:00:00.000Z',
          },
          NOW,
        ),
      ).toBe('expired')
    }
  })

  it('never expires a punch pass — a punch ends by being spent', () => {
    expect(
      passState(
        {
          membershipAccessPass: 'punch',
          membershipConfirmed: true,
          membershipExpiry: '2020-01-01T00:00:00.000Z',
        },
        NOW,
      ),
    ).toBe('active')
  })
})
