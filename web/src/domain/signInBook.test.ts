import { describe, expect, it } from 'vitest'
import type { LogEntry } from '@/services/logbook'
import {
  accessKind,
  filterLogs,
  groupLogsByDay,
  isPurchaseEntry,
  shouldResetLastSignIn,
} from './signInBook'

function entry(over: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'l1',
    timestamp: '2026-08-23T14:00:00.000Z',
    userId: 'uid-1',
    userName: 'Alex Climber',
    accessType: 'Active Member',
    ...over,
  }
}

describe('isPurchaseEntry', () => {
  it('recognises a purchase row by its notes prefix', () => {
    expect(isPurchaseEntry(entry({ notes: 'Purchased: 10x Punch Passes $160' }))).toBe(true)
  })

  it('treats a sign-in with no notes as not a purchase', () => {
    expect(isPurchaseEntry(entry())).toBe(false)
  })

  it('does not match when "Purchased:" appears mid-note', () => {
    expect(isPurchaseEntry(entry({ notes: 'Asked about Purchased: passes' }))).toBe(false)
  })
})

describe('filterLogs', () => {
  const logs = [
    entry({ id: 'a', userId: 'uid-1', userName: 'Alex Climber' }),
    entry({ id: 'b', userId: 'uid-2', userName: 'Sam Boulder' }),
    entry({ id: 'c', userId: 'uid-2', userName: 'Sam Boulder', notes: 'Purchased: Drop-In $20' }),
  ]
  const base = { search: '', mineOnly: false, canSeePurchases: true }

  it('hides purchase rows from members', () => {
    const got = filterLogs(logs, { ...base, canSeePurchases: false })
    expect(got.map((l) => l.id)).toEqual(['a', 'b'])
  })

  it('keeps purchase rows for supervisors', () => {
    expect(filterLogs(logs, base)).toHaveLength(3)
  })

  it('restricts to the current user when mineOnly is set', () => {
    const got = filterLogs(logs, { ...base, mineOnly: true, uid: 'uid-2' })
    expect(got.map((l) => l.id)).toEqual(['b', 'c'])
  })

  it('searches on name, case-insensitively', () => {
    expect(filterLogs(logs, { ...base, search: 'sam' }).map((l) => l.id)).toEqual(['b', 'c'])
  })

  it('ignores surrounding whitespace in the search', () => {
    expect(filterLogs(logs, { ...base, search: '  alex  ' }).map((l) => l.id)).toEqual(['a'])
  })

  it('applies mineOnly, search and purchase-hiding together', () => {
    const got = filterLogs(logs, {
      search: 'sam',
      mineOnly: true,
      uid: 'uid-2',
      canSeePurchases: false,
    })
    expect(got.map((l) => l.id)).toEqual(['b'])
  })
})

describe('groupLogsByDay', () => {
  it('groups consecutive entries from the same day', () => {
    const days = groupLogsByDay([
      entry({ id: 'a', timestamp: '2026-08-23T18:00:00.000Z' }),
      entry({ id: 'b', timestamp: '2026-08-23T14:00:00.000Z' }),
      entry({ id: 'c', timestamp: '2026-08-22T14:00:00.000Z' }),
    ])
    expect(days).toHaveLength(2)
    expect(days[0].entries.map((e) => e.id)).toEqual(['a', 'b'])
    expect(days[1].entries.map((e) => e.id)).toEqual(['c'])
  })

  it('preserves the order it was given', () => {
    const days = groupLogsByDay([
      entry({ id: 'newer', timestamp: '2026-08-23T18:00:00.000Z' }),
      entry({ id: 'older', timestamp: '2026-08-23T09:00:00.000Z' }),
    ])
    expect(days[0].entries.map((e) => e.id)).toEqual(['newer', 'older'])
  })

  it('returns nothing for an empty list', () => {
    expect(groupLogsByDay([])).toEqual([])
  })
})

describe('shouldResetLastSignIn', () => {
  const now = new Date('2026-08-23T20:00:00.000Z')
  const todays = (over: Partial<LogEntry> = {}) =>
    entry({ timestamp: '2026-08-23T14:00:00.000Z', ...over })

  it('resets when the removed entry was the only sign-in today', () => {
    expect(shouldResetLastSignIn(todays(), [], now)).toBe(true)
  })

  it('does not reset when another sign-in today remains', () => {
    const remaining = [todays({ id: 'other', timestamp: '2026-08-23T09:00:00.000Z' })]
    expect(shouldResetLastSignIn(todays(), remaining, now)).toBe(false)
  })

  it('ignores a purchase row when deciding — buying is not attending', () => {
    const remaining = [
      todays({ id: 'buy', timestamp: '2026-08-23T09:00:00.000Z', notes: 'Purchased: Drop-In $20' }),
    ]
    expect(shouldResetLastSignIn(todays(), remaining, now)).toBe(true)
  })

  it('ignores another member’s sign-in today', () => {
    const remaining = [todays({ id: 'other', userId: 'uid-2' })]
    expect(shouldResetLastSignIn(todays(), remaining, now)).toBe(true)
  })

  it('does nothing for an entry from a previous day', () => {
    const old = entry({ timestamp: '2026-08-20T14:00:00.000Z' })
    expect(shouldResetLastSignIn(old, [], now)).toBe(false)
  })

  it('does nothing for an entry with no userId', () => {
    expect(shouldResetLastSignIn(todays({ userId: '' }), [], now)).toBe(false)
  })
})

describe('accessKind', () => {
  it.each([
    ['Active Member', 'member'],
    // Membership sign-ins are named after the pass now, not the status.
    ['Annual pass', 'member'],
    ['1-month pass', 'member'],
    ['Student annual pass', 'member'],
    ['Access pass', 'member'],
    ['Punch Pass (4 left)', 'punch'],
    ['Punch Pass (from Jane)', 'punch'],
    ['Drop-In', 'dropin'],
    ['Voucher', 'other'],
  ])('maps %s to %s', (input, expected) => {
    expect(accessKind(input)).toBe(expected)
  })
})
