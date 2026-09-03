import { describe, expect, it } from 'vitest'
import {
  NEVER_SEEN_BUCKET,
  accessRank,
  compareMembersSmart,
  daysSinceLastSignIn,
  holdsUsableAccess,
  isActiveMember,
  recencyBucket,
  smartSortMembers,
  sortMembers,
  type SortableMember,
} from './memberSort'

const NOW = new Date('2026-09-03T12:00:00.000Z')

/** Days before NOW, as the ISO string a record would carry. */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

function member(overrides: Partial<SortableMember> = {}): SortableMember {
  return {
    name: 'Test Member',
    membershipAccessPass: 'none',
    membershipConfirmed: true,
    punchPassRemaining: 0,
    ...overrides,
  }
}

describe('daysSinceLastSignIn', () => {
  it('is null for a member the gym has never seen', () => {
    expect(daysSinceLastSignIn(member(), NOW)).toBeNull()
  })

  it('is null rather than NaN for a timestamp that will not parse', () => {
    expect(daysSinceLastSignIn(member({ lastSignInAt: 'last tuesday' }), NOW)).toBeNull()
  })

  it('counts back from now', () => {
    expect(daysSinceLastSignIn(member({ lastSignInAt: daysAgo(10) }), NOW)).toBeCloseTo(10)
  })
})

describe('recencyBucket', () => {
  it('groups by how recently the member was in', () => {
    expect(recencyBucket(member({ lastSignInAt: daysAgo(1) }), NOW)).toBe(0)
    expect(recencyBucket(member({ lastSignInAt: daysAgo(7) }), NOW)).toBe(0)
    expect(recencyBucket(member({ lastSignInAt: daysAgo(8) }), NOW)).toBe(1)
    expect(recencyBucket(member({ lastSignInAt: daysAgo(30) }), NOW)).toBe(1)
    expect(recencyBucket(member({ lastSignInAt: daysAgo(60) }), NOW)).toBe(2)
    expect(recencyBucket(member({ lastSignInAt: daysAgo(120) }), NOW)).toBe(3)
    expect(recencyBucket(member({ lastSignInAt: daysAgo(400) }), NOW)).toBe(4)
  })

  it('puts a member who has never signed in behind every bucket', () => {
    expect(recencyBucket(member(), NOW)).toBe(NEVER_SEEN_BUCKET)
    expect(NEVER_SEEN_BUCKET).toBeGreaterThan(recencyBucket(member({ lastSignInAt: daysAgo(400) }), NOW))
  })

  it('reads a future timestamp as the most recent thing on the record', () => {
    expect(recencyBucket(member({ lastSignInAt: daysAgo(-3) }), NOW)).toBe(0)
  })
})

describe('accessRank', () => {
  it('leads with whoever can walk in right now', () => {
    expect(accessRank(member({ membershipAccessPass: 'annual', membershipConfirmed: true }))).toBe(0)
    expect(accessRank(member({ punchPassRemaining: 2 }))).toBe(0)
  })

  it('counts punches even when the pass field says none', () => {
    expect(holdsUsableAccess(member({ membershipAccessPass: 'none', punchPassRemaining: 1 }))).toBe(
      true,
    )
  })

  it('puts an unconfirmed pass behind a usable one but ahead of nothing', () => {
    expect(accessRank(member({ membershipAccessPass: 'annual', membershipConfirmed: false }))).toBe(1)
    expect(accessRank(member({ membershipAccessPass: 'dropin' }))).toBe(1)
    expect(accessRank(member())).toBe(2)
  })
})

describe('compareMembersSmart', () => {
  it('puts the more recent visitor first', () => {
    const recent = member({ name: 'Zoe', lastSignInAt: daysAgo(1) })
    const older = member({ name: 'Adam', lastSignInAt: daysAgo(200) })
    expect(compareMembersSmart(recent, older, NOW)).toBeLessThan(0)
  })

  it('lets the pass decide between two members of comparable recency', () => {
    // Six days apart, so both are in the same bucket — which is the whole point
    // of bucketing: on a raw timestamp the pass would never break a tie at all.
    const withPass = member({
      name: 'Adam',
      lastSignInAt: daysAgo(6),
      membershipAccessPass: 'annual',
      membershipConfirmed: true,
    })
    const without = member({ name: 'Zoe', lastSignInAt: daysAgo(1) })
    expect(compareMembersSmart(withPass, without, NOW)).toBeLessThan(0)
  })

  it('does not let a pass outrank a whole bucket of recency', () => {
    const staleWithPass = member({
      lastSignInAt: daysAgo(200),
      membershipAccessPass: 'annual',
      membershipConfirmed: true,
    })
    const recentWithout = member({ lastSignInAt: daysAgo(2) })
    expect(compareMembersSmart(recentWithout, staleWithPass, NOW)).toBeLessThan(0)
  })

  it('orders by the exact visit once bucket and access agree', () => {
    const a = member({ name: 'Zoe', lastSignInAt: daysAgo(2) })
    const b = member({ name: 'Adam', lastSignInAt: daysAgo(5) })
    expect(compareMembersSmart(a, b, NOW)).toBeLessThan(0)
  })

  it('falls through to the name so the order is total', () => {
    // Two never-seen members holding nothing: everything above the name ties,
    // and without it the list would reshuffle between renders.
    const adam = member({ name: 'Adam' })
    const zoe = member({ name: 'Zoe' })
    expect(compareMembersSmart(adam, zoe, NOW)).toBeLessThan(0)
    expect(compareMembersSmart(zoe, adam, NOW)).toBeGreaterThan(0)
    expect(compareMembersSmart(adam, adam, NOW)).toBe(0)
  })

  it('sorts on the name the list actually shows', () => {
    const shown = member({ name: 'Zoe Zimmer', preferredName: 'Adam' })
    const other = member({ name: 'Beth' })
    expect(compareMembersSmart(shown, other, NOW)).toBeLessThan(0)
  })

  it('keeps a member who has been in ahead of one who never has, within a bucket', () => {
    const seen = member({ name: 'Zoe', lastSignInAt: daysAgo(400) })
    const never = member({ name: 'Adam' })
    // Different buckets, so this is really about NEVER_SEEN sorting last.
    expect(compareMembersSmart(seen, never, NOW)).toBeLessThan(0)
  })
})

describe('smartSortMembers', () => {
  it('ranks the desk queue the way the gym would guess it', () => {
    const regularWithPass = member({
      name: 'Regular',
      lastSignInAt: daysAgo(2),
      membershipAccessPass: 'annual',
      membershipConfirmed: true,
    })
    const regularNoPass = member({ name: 'Lapsed regular', lastSignInAt: daysAgo(3) })
    const punchHolder = member({ name: 'Punch holder', lastSignInAt: daysAgo(40), punchPassRemaining: 5 })
    const importedRoster = member({ name: 'Imported' })

    expect(
      smartSortMembers([importedRoster, regularNoPass, punchHolder, regularWithPass], NOW).map(
        (m) => m.name,
      ),
    ).toEqual(['Regular', 'Lapsed regular', 'Punch holder', 'Imported'])
  })

  it('does not sort the array it was handed in place', () => {
    const list = [member({ name: 'Zoe' }), member({ name: 'Adam' })]
    smartSortMembers(list, NOW)
    expect(list.map((m) => m.name)).toEqual(['Zoe', 'Adam'])
  })

  it('survives a directory full of half-written records', () => {
    const rows = [
      member({ name: undefined, lastSignInAt: 'nonsense' }),
      member({ name: 'Real', lastSignInAt: daysAgo(1) }),
      member({ name: undefined }),
    ]
    expect(() => smartSortMembers(rows, NOW)).not.toThrow()
    expect(smartSortMembers(rows, NOW)[0].name).toBe('Real')
  })
})

describe('isActiveMember', () => {
  it('counts a member who has been in lately', () => {
    expect(isActiveMember(member({ lastSignInAt: daysAgo(30) }), NOW)).toBe(true)
    expect(isActiveMember(member({ lastSignInAt: daysAgo(400) }), NOW)).toBe(false)
  })

  it('counts a pass or a punch as evidence of a live member', () => {
    // The bug this fixes: bought an annual pass this morning, has not been in
    // yet, and the directory called them inactive.
    expect(
      isActiveMember(
        member({ membershipAccessPass: 'annual', membershipConfirmed: true }),
        NOW,
      ),
    ).toBe(true)
    expect(isActiveMember(member({ punchPassRemaining: 3 }), NOW)).toBe(true)
  })

  it('does not count a pass an admin has yet to confirm', () => {
    expect(
      isActiveMember(
        member({ membershipAccessPass: 'annual', membershipConfirmed: false }),
        NOW,
      ),
    ).toBe(false)
  })

  it('refuses a visit that has not happened yet', () => {
    expect(isActiveMember(member({ lastSignInAt: daysAgo(-3) }), NOW)).toBe(false)
  })

  it('is false for a name on an imported roster and nothing else', () => {
    expect(isActiveMember(member(), NOW)).toBe(false)
  })
})

describe('sortMembers', () => {
  const zoe = member({ name: 'Zoe', lastSignInAt: daysAgo(1) })
  const adam = member({ name: 'Adam', lastSignInAt: daysAgo(300) })
  const never = member({ name: 'Mo' })

  it('defaults to Smart Sort', () => {
    expect(sortMembers([adam, never, zoe]).map((m) => m.name)).toEqual(
      smartSortMembers([adam, never, zoe]).map((m) => m.name),
    )
  })

  it('sorts by name when the name sort is chosen', () => {
    expect(sortMembers([zoe, never, adam], 'name', NOW).map((m) => m.name)).toEqual([
      'Adam',
      'Mo',
      'Zoe',
    ])
  })

  it('sorts by the raw visit when Last in is chosen, ignoring the pass', () => {
    // Adam holds a pass and Zoe does not; under Smart Sort that would matter,
    // and here it must not — Zoe was in yesterday.
    const adamWithPass = member({
      name: 'Adam',
      lastSignInAt: daysAgo(300),
      membershipAccessPass: 'annual',
      membershipConfirmed: true,
    })
    expect(sortMembers([never, adamWithPass, zoe], 'recent', NOW).map((m) => m.name)).toEqual([
      'Zoe',
      'Adam',
      'Mo',
    ])
  })

  it('puts members nobody has ever seen last, by name', () => {
    const alsoNever = member({ name: 'Ana' })
    expect(sortMembers([never, alsoNever, zoe], 'recent', NOW).map((m) => m.name)).toEqual([
      'Zoe',
      'Ana',
      'Mo',
    ])
  })
})
