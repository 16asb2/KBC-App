import { describe, expect, it } from 'vitest'
import { getGymStatusFromEvents, isRequestedEvent, isSameDay, isSupervisorEvent, layoutEvents } from './calendarEvent'
import type { CalendarEvent } from '@/services/calendar'

function timedEvent(summary: string, start: string, end: string): CalendarEvent {
  return { id: summary, summary, start: { dateTime: start }, end: { dateTime: end } }
}

describe('isSupervisorEvent', () => {
  it('matches "(super)" and legacy "(sup)"', () => {
    expect(isSupervisorEvent('Artur (super)')).toBe(true)
    expect(isSupervisorEvent('Artur (sup) + Garry')).toBe(true)
  })

  it('is false for a plain event', () => {
    expect(isSupervisorEvent('Open Gym')).toBe(false)
    expect(isSupervisorEvent(undefined)).toBe(false)
  })
})

describe('isRequestedEvent', () => {
  it('matches "(requested)"', () => {
    expect(isRequestedEvent('Jane (requested)')).toBe(true)
  })

  it('is false otherwise', () => {
    expect(isRequestedEvent('Jane (super)')).toBe(false)
  })
})

describe('isSameDay', () => {
  it('is true for the same calendar day in different times', () => {
    expect(isSameDay(new Date('2026-06-15T01:00:00'), new Date('2026-06-15T23:00:00'))).toBe(true)
  })

  it('is false across a day boundary', () => {
    expect(isSameDay(new Date('2026-06-15T23:59:00'), new Date('2026-06-16T00:01:00'))).toBe(false)
  })
})

describe('getGymStatusFromEvents', () => {
  const now = new Date('2026-06-15T18:00:00.000Z')

  it('is open during a current supervisor slot', () => {
    const events = [timedEvent('Artur (super)', '2026-06-15T17:00:00.000Z', '2026-06-15T20:00:00.000Z')]
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

  it('is closed with no next session when there are no supervisor events', () => {
    const status = getGymStatusFromEvents([], now)
    expect(status.open).toBe(false)
    if (!status.open) expect(status.next).toBeNull()
  })
})

describe('layoutEvents', () => {
  it('gives non-overlapping events their own full-width column', () => {
    const events = [
      timedEvent('A', '2026-06-15T09:00:00', '2026-06-15T10:00:00'),
      timedEvent('B', '2026-06-15T11:00:00', '2026-06-15T12:00:00'),
    ]
    const positioned = layoutEvents(events)
    expect(positioned.every((e) => e.column === 0 && e.numColumns === 1)).toBe(true)
  })

  it('splits overlapping events into side-by-side columns', () => {
    const events = [
      timedEvent('A', '2026-06-15T09:00:00', '2026-06-15T10:30:00'),
      timedEvent('B', '2026-06-15T09:30:00', '2026-06-15T10:00:00'),
    ]
    const positioned = layoutEvents(events)
    const a = positioned.find((e) => e.id === 'A')!
    const b = positioned.find((e) => e.id === 'B')!
    expect(a.numColumns).toBe(2)
    expect(b.numColumns).toBe(2)
    expect(a.column).not.toBe(b.column)
  })

  it('drops events missing a dateTime (all-day events)', () => {
    const positioned = layoutEvents([{ id: 'allday', summary: 'x', start: { date: '2026-06-15' }, end: { date: '2026-06-16' } }])
    expect(positioned).toHaveLength(0)
  })
})
