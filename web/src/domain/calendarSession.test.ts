import { describe, expect, it } from 'vitest'
import type { CalendarEvent, CalendarParticipant } from '@/services/calendar'
import {
  buildTitle,
  classifyOverlap,
  hasSupervisor,
  isParticipant,
  parseParticipants,
  participantsFor,
  reconstructParticipantsFromTitle,
  subtractIntervals,
} from './calendarSession'

const sup: CalendarParticipant = { uid: 'u1', name: 'Artur', role: 'supervisor' }
const mem: CalendarParticipant = { uid: 'u2', name: 'Garry', role: 'member' }
const adm: CalendarParticipant = { uid: 'u3', name: 'Pat', role: 'admin' }

function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1',
    summary: 'Artur (super)',
    start: { dateTime: '2026-08-23T16:00:00-04:00' },
    end: { dateTime: '2026-08-23T18:00:00-04:00' },
    ...over,
  }
}

function withParticipants(list: CalendarParticipant[], summary?: string): CalendarEvent {
  return event({
    summary: summary ?? buildTitle(list),
    extendedProperties: { private: { participants: JSON.stringify(list) } },
  })
}

describe('buildTitle', () => {
  it('marks supervisors and admins, but not members', () => {
    expect(buildTitle([sup, mem, adm])).toBe('Artur (super) + Garry + Pat (super)')
  })

  it('handles a lone member', () => {
    expect(buildTitle([mem])).toBe('Garry')
  })

  it('produces an empty title for an empty roster', () => {
    expect(buildTitle([])).toBe('')
  })
})

describe('parseParticipants', () => {
  it('reads a tracked roster', () => {
    expect(parseParticipants(withParticipants([sup, mem]))).toEqual([sup, mem])
  })

  it('returns nothing when the event has no extendedProperties', () => {
    expect(parseParticipants(event())).toEqual([])
  })

  it('survives malformed JSON rather than throwing', () => {
    const bad = event({ extendedProperties: { private: { participants: '{not json' } } })
    expect(parseParticipants(bad)).toEqual([])
  })

  it('ignores a non-array payload', () => {
    const odd = event({ extendedProperties: { private: { participants: '{"uid":"x"}' } } })
    expect(parseParticipants(odd)).toEqual([])
  })
})

describe('reconstructParticipantsFromTitle', () => {
  it('splits a multi-person title and detects (super)', () => {
    const got = reconstructParticipantsFromTitle('Artur (super) + Garry')
    expect(got.map((p) => [p.name, p.role])).toEqual([
      ['Artur', 'supervisor'],
      ['Garry', 'member'],
    ])
  })

  it('accepts the legacy (sup) spelling', () => {
    expect(reconstructParticipantsFromTitle('Chad (sup)')[0].role).toBe('supervisor')
  })

  it('marks reconstructed uids as legacy so they cannot collide with real ones', () => {
    const got = reconstructParticipantsFromTitle('Artur (super) + Garry')
    expect(got.every((p) => p.uid.startsWith('legacy_'))).toBe(true)
    expect(got[1].uid).toBe('legacy_1_garry')
  })
})

describe('participantsFor', () => {
  it('prefers the tracked roster over the title', () => {
    const e = withParticipants([sup, mem], 'Stale Title')
    expect(participantsFor(e).map((p) => p.name)).toEqual(['Artur', 'Garry'])
  })

  it('falls back to the title for a legacy event', () => {
    expect(participantsFor(event({ summary: 'Chris (super) + Elis' })).map((p) => p.name)).toEqual([
      'Chris',
      'Elis',
    ])
  })

  it('returns nothing for an event with neither', () => {
    expect(participantsFor(event({ summary: undefined }))).toEqual([])
  })
})

describe('isParticipant', () => {
  it('finds a tracked member by uid', () => {
    expect(isParticipant(withParticipants([sup, mem]), 'u2')).toBe(true)
  })

  it('is false for someone not on the event', () => {
    expect(isParticipant(withParticipants([sup]), 'u2')).toBe(false)
  })

  it('never matches a legacy event, whose uids are synthetic', () => {
    // Joining a legacy event appends rather than deduplicating — the safe way
    // to be wrong, since it can't silently drop someone.
    expect(isParticipant(event({ summary: 'Garry' }), 'u2')).toBe(false)
  })
})

describe('hasSupervisor', () => {
  it('is true for a supervisor', () => {
    expect(hasSupervisor([sup, mem])).toBe(true)
  })

  it('is true for an admin', () => {
    expect(hasSupervisor([adm, mem])).toBe(true)
  })

  it('is false once only members remain', () => {
    expect(hasSupervisor([mem])).toBe(false)
  })

  it('is false for an empty roster', () => {
    expect(hasSupervisor([])).toBe(false)
  })
})

// Interval helpers work in plain hours on a fixed day; the logic is
// timezone-agnostic because it compares Date instants.
const at = (h: number) => new Date(`2026-08-23T${String(h).padStart(2, '0')}:00:00Z`)
const iv = (a: number, b: number) => ({ start: at(a), end: at(b) })
const hours = (list: { start: Date; end: Date }[]) =>
  list.map((i) => [i.start.getUTCHours(), i.end.getUTCHours()])

describe('subtractIntervals', () => {
  it('returns the whole span when nothing overlaps', () => {
    expect(hours(subtractIntervals(at(10), at(14), [iv(16, 18)]))).toEqual([[10, 14]])
  })

  it('removes a covered middle, leaving two pieces', () => {
    expect(hours(subtractIntervals(at(10), at(18), [iv(12, 14)]))).toEqual([
      [10, 12],
      [14, 18],
    ])
  })

  it('trims the front when the overlap starts earlier', () => {
    expect(hours(subtractIntervals(at(10), at(14), [iv(8, 12)]))).toEqual([[12, 14]])
  })

  it('trims the back when the overlap runs later', () => {
    expect(hours(subtractIntervals(at(10), at(14), [iv(12, 16)]))).toEqual([[10, 12]])
  })

  it('returns nothing when fully covered', () => {
    expect(subtractIntervals(at(10), at(14), [iv(8, 18)])).toEqual([])
  })

  it('handles several overlaps at once, regardless of the order given', () => {
    const got = subtractIntervals(at(8), at(20), [iv(16, 18), iv(10, 12)])
    expect(hours(got)).toEqual([
      [8, 10],
      [12, 16],
      [18, 20],
    ])
  })

  it('treats touching-but-not-overlapping as no overlap', () => {
    expect(hours(subtractIntervals(at(10), at(14), [iv(14, 16)]))).toEqual([[10, 14]])
  })
})

describe('classifyOverlap', () => {
  const slot = iv(12, 16)

  it('leaves a request that ends before the slot', () => {
    expect(classifyOverlap(iv(8, 12), slot)).toBe('none')
  })

  it('leaves a request that starts after the slot', () => {
    expect(classifyOverlap(iv(16, 20), slot)).toBe('none')
  })

  it('deletes a request the slot swallows', () => {
    expect(classifyOverlap(iv(13, 15), slot)).toBe('contained')
  })

  it('treats an exactly-equal request as contained', () => {
    expect(classifyOverlap(iv(12, 16), slot)).toBe('contained')
  })

  it('splits a request that extends past both ends', () => {
    expect(classifyOverlap(iv(10, 18), slot)).toBe('spans')
  })

  it('trims the end of a request that started first', () => {
    expect(classifyOverlap(iv(10, 14), slot)).toBe('trim-end')
  })

  it('trims the start of a request that runs later', () => {
    expect(classifyOverlap(iv(14, 18), slot)).toBe('trim-start')
  })
})
