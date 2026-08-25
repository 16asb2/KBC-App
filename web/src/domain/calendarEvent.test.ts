import { describe, expect, it } from 'vitest'
import {
  eventKind,
  getGymStatusFromEvents,
  isClimbSession,
  isRequestedEvent,
  isSupervisorEvent,
  layoutEvents,
  minutesToY,
  TIMELINE_END_HOUR,
  yToMinutes,
} from './calendarEvent'
import type { CalendarEvent } from '@/services/calendar'

function timedEvent(summary: string, start: string, end: string): CalendarEvent {
  return { id: summary, summary, start: { dateTime: start }, end: { dateTime: end } }
}

/** "09:00" on the fixed test day. */
function at(hhmm: string): string {
  return `2026-06-15T${hhmm}:00`
}

describe('isSupervisorEvent', () => {
  it('matches "(super)" and legacy "(sup)"', () => {
    expect(isSupervisorEvent('Artur (super)')).toBe(true)
    expect(isSupervisorEvent('Artur (sup) + Garry')).toBe(true)
  })

  it('matches a session with more than one supervisor on it', () => {
    expect(isSupervisorEvent('Artur (super) + Bea (super)')).toBe(true)
    expect(isSupervisorEvent('Garry + Bea (super)')).toBe(true)
  })

  it('is false for a plain event', () => {
    expect(isSupervisorEvent('Open Gym')).toBe(false)
    expect(isSupervisorEvent(undefined)).toBe(false)
  })

  it('requires the suffix to end a name, not merely appear in the title', () => {
    expect(isSupervisorEvent('Ladies Night (super fun)')).toBe(false)
    expect(isSupervisorEvent('(super) secret comp')).toBe(false)
  })
})

describe('isRequestedEvent', () => {
  it('matches "(requested)"', () => {
    expect(isRequestedEvent('Jane (requested)')).toBe(true)
  })

  it('is false otherwise', () => {
    expect(isRequestedEvent('Jane (super)')).toBe(false)
    expect(isRequestedEvent('Gear (requested) swap night')).toBe(false)
  })
})

describe('eventKind', () => {
  it('reads the title when there are no extended properties', () => {
    expect(eventKind(timedEvent('Artur (super)', at('18:00'), at('20:00')))).toBe('session')
    expect(eventKind(timedEvent('Garry (requested)', at('18:00'), at('20:00')))).toBe('request')
    expect(eventKind(timedEvent('Ladies Night', at('18:00'), at('20:00')))).toBe('special')
  })

  it('prefers the type the app wrote over the title', () => {
    const e = timedEvent('Comp Night (super fun)', at('18:00'), at('20:00'))
    e.extendedProperties = { private: { type: 'specialEvent' } }
    expect(eventKind(e)).toBe('special')
  })

  it('treats an untitled event as a special event', () => {
    expect(eventKind({ id: 'x', start: { date: '2026-06-15' }, end: { date: '2026-06-16' } })).toBe(
      'special',
    )
  })

  it('marks sessions and requests as climb sessions, special events not', () => {
    expect(isClimbSession(timedEvent('Artur (super)', at('18:00'), at('20:00')))).toBe(true)
    expect(isClimbSession(timedEvent('Garry (requested)', at('18:00'), at('20:00')))).toBe(true)
    expect(isClimbSession(timedEvent('Ladies Night', at('18:00'), at('20:00')))).toBe(false)
  })
})

describe('yToMinutes', () => {
  it('is the inverse of minutesToY', () => {
    for (const minutes of [6 * 60, 9 * 60 + 30, 21 * 60 + 45]) {
      expect(yToMinutes(minutesToY(minutes))).toBeCloseTo(minutes)
    }
  })
})

describe('getGymStatusFromEvents', () => {
  const now = new Date('2026-06-15T18:00:00.000Z')

  it('is open during a current supervisor slot', () => {
    const events = [
      timedEvent('Artur (super)', '2026-06-15T17:00:00.000Z', '2026-06-15T20:00:00.000Z'),
    ]
    const status = getGymStatusFromEvents(events, now)
    expect(status.open).toBe(true)
    if (status.open) {
      expect(status.supervisorName).toBe('Artur')
      expect(status.until.toISOString()).toBe('2026-06-15T20:00:00.000Z')
    }
  })

  it('is closed with the next supervisor slot when none is current', () => {
    const events = [
      timedEvent('Non-super event', '2026-06-15T10:00:00.000Z', '2026-06-15T11:00:00.000Z'),
      timedEvent('Artur (super)', '2026-06-16T17:00:00.000Z', '2026-06-16T20:00:00.000Z'),
    ]
    const status = getGymStatusFromEvents(events, now)
    expect(status.open).toBe(false)
    if (!status.open) {
      expect(status.next?.toISOString()).toBe('2026-06-16T17:00:00.000Z')
    }
  })

  it('does not count a special event a supervisor put on the calendar', () => {
    const closure = timedEvent(
      'Closed for maintenance',
      '2026-06-15T17:00:00.000Z',
      '2026-06-15T20:00:00.000Z',
    )
    closure.extendedProperties = { private: { type: 'specialEvent', createdByRole: 'supervisor' } }
    const status = getGymStatusFromEvents([closure], now)
    expect(status.open).toBe(false)
  })

  it('is closed with no next session when there are no supervisor events', () => {
    const status = getGymStatusFromEvents([], now)
    expect(status.open).toBe(false)
    if (!status.open) expect(status.next).toBeNull()
  })
})

describe('layoutEvents', () => {
  it('gives non-overlapping events their own full-width column', () => {
    const positioned = layoutEvents([
      timedEvent('A', at('09:00'), at('10:00')),
      timedEvent('B', at('11:00'), at('12:00')),
    ])
    expect(positioned.every((e) => e.column === 0 && e.numColumns === 1 && e.span === 1)).toBe(true)
  })

  it('splits overlapping events into side-by-side columns', () => {
    const positioned = layoutEvents([
      timedEvent('A', at('09:00'), at('10:30')),
      timedEvent('B', at('09:30'), at('10:00')),
    ])
    const a = positioned.find((e) => e.id === 'A')!
    const b = positioned.find((e) => e.id === 'B')!
    expect(a.numColumns).toBe(2)
    expect(b.numColumns).toBe(2)
    expect(a.column).not.toBe(b.column)
  })

  it('keeps every short event clear of the long one enclosing them', () => {
    // The regression this layout was rewritten for: a three-hour supervisor
    // slot with three short requests inside it. Comparing each event against
    // only the previous one stopped seeing the overlap after the first, and B,
    // C and D were drawn full-width on top of A.
    const positioned = layoutEvents([
      timedEvent('A', at('09:00'), at('12:00')),
      timedEvent('B', at('09:15'), at('09:45')),
      timedEvent('C', at('10:00'), at('10:30')),
      timedEvent('D', at('11:00'), at('11:30')),
    ])
    const a = positioned.find((e) => e.id === 'A')!
    expect(positioned.every((e) => e.numColumns === 2)).toBe(true)
    expect(a.column).toBe(0)
    expect(a.span).toBe(1)
    for (const id of ['B', 'C', 'D']) {
      expect(positioned.find((e) => e.id === id)!.column).toBe(1)
    }
  })

  it('widens an event across columns nothing else needs at that time', () => {
    const positioned = layoutEvents([
      timedEvent('A', at('09:00'), at('12:00')),
      timedEvent('B', at('09:15'), at('09:45')),
      timedEvent('C', at('09:20'), at('09:40')),
      timedEvent('D', at('10:00'), at('10:30')),
    ])
    const d = positioned.find((e) => e.id === 'D')!
    expect(d.numColumns).toBe(3)
    expect(d.column).toBe(1)
    // B and C are long gone by 10:00, so D takes both remaining columns.
    expect(d.span).toBe(2)
  })

  it('starts a fresh cluster once a gap opens', () => {
    const positioned = layoutEvents([
      timedEvent('A', at('09:00'), at('10:00')),
      timedEvent('B', at('09:30'), at('10:00')),
      timedEvent('C', at('11:00'), at('12:00')),
    ])
    expect(positioned.find((e) => e.id === 'C')!.numColumns).toBe(1)
    expect(positioned.find((e) => e.id === 'A')!.numColumns).toBe(2)
  })

  it('clamps an event running past midnight to the end of the timeline', () => {
    const positioned = layoutEvents([timedEvent('A', at('22:00'), '2026-06-16T00:30:00')])
    const a = positioned[0]
    expect(a.height).toBeGreaterThan(0)
    expect(a.top + a.height).toBeCloseTo(minutesToY(TIMELINE_END_HOUR * 60))
  })

  it('gives a very short event a legible minimum height', () => {
    const positioned = layoutEvents([timedEvent('A', at('09:00'), at('09:05'))])
    expect(positioned[0].height).toBeGreaterThanOrEqual(20)
  })

  it('drops events missing a dateTime (all-day events)', () => {
    const positioned = layoutEvents([
      { id: 'allday', summary: 'x', start: { date: '2026-06-15' }, end: { date: '2026-06-16' } },
    ])
    expect(positioned).toHaveLength(0)
  })
})
