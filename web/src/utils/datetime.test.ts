import { describe, expect, it } from 'vitest'
import {
  formatDayWithRelative,
  formatRelativeDateTime,
  formatTime,
  isSameDay,
  relativeDayLabel,
  startOfDay,
} from './datetime'

// Fixed local-time instants — no Z suffix, so these are the same wall-clock
// values whatever zone the test runs in.
const MONDAY_9PM = new Date('2026-06-15T21:05:00')
const TUESDAY = new Date('2026-06-16T08:00:00')
const SUNDAY = new Date('2026-06-14T23:30:00')

describe('formatTime', () => {
  it('uses a 12-hour clock with no leading zero', () => {
    expect(formatTime(new Date('2026-06-15T09:05:00'))).toBe('9:05 AM')
    expect(formatTime(MONDAY_9PM)).toBe('9:05 PM')
  })

  it('accepts an ISO string as well as a Date', () => {
    expect(formatTime('2026-06-15T21:05:00')).toBe(formatTime(MONDAY_9PM))
  })

  it('renders midnight and noon unambiguously', () => {
    expect(formatTime(new Date('2026-06-15T00:00:00'))).toBe('12:00 AM')
    expect(formatTime(new Date('2026-06-15T12:00:00'))).toBe('12:00 PM')
  })
})

describe('isSameCalendarDay', () => {
  it('ignores the time of day', () => {
    expect(isSameDay(new Date('2026-06-15T01:00:00'), MONDAY_9PM)).toBe(true)
  })

  it('is false either side of midnight', () => {
    expect(isSameDay(SUNDAY, MONDAY_9PM)).toBe(false)
  })
})

describe('startOfDay', () => {
  it('normalises to local midnight', () => {
    const d = startOfDay(MONDAY_9PM)
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
    expect(d.getDate()).toBe(15)
  })
})

describe('relativeDayLabel', () => {
  it('names today whichever directions are enabled', () => {
    expect(relativeDayLabel(MONDAY_9PM, { now: MONDAY_9PM })).toBe('Today')
  })

  it('names tomorrow only when looking forward', () => {
    expect(relativeDayLabel(TUESDAY, { future: true, now: MONDAY_9PM })).toBe('Tomorrow')
    expect(relativeDayLabel(TUESDAY, { past: true, now: MONDAY_9PM })).toBeNull()
  })

  it('names yesterday only when looking back', () => {
    expect(relativeDayLabel(SUNDAY, { past: true, now: MONDAY_9PM })).toBe('Yesterday')
    expect(relativeDayLabel(SUNDAY, { future: true, now: MONDAY_9PM })).toBeNull()
  })

  it('is null for a day with no name of its own', () => {
    expect(
      relativeDayLabel(new Date('2026-06-20T10:00:00'), {
        past: true,
        future: true,
        now: MONDAY_9PM,
      }),
    ).toBeNull()
  })

  it('compares calendar days, not elapsed hours', () => {
    // 90 minutes apart, but either side of midnight — that is yesterday.
    const lateSunday = new Date('2026-06-14T23:30:00')
    const earlyMonday = new Date('2026-06-15T01:00:00')
    expect(relativeDayLabel(lateSunday, { past: true, now: earlyMonday })).toBe('Yesterday')
  })
})

describe('formatDayWithRelative', () => {
  it('prefixes the relative label when there is one', () => {
    expect(formatDayWithRelative(TUESDAY, { future: true, now: MONDAY_9PM })).toBe(
      'Tomorrow · Tuesday, June 16',
    )
  })

  it('falls back to the date alone', () => {
    expect(
      formatDayWithRelative(new Date('2026-06-20T10:00:00'), { future: true, now: MONDAY_9PM }),
    ).toBe('Saturday, June 20')
  })

  it('takes a custom separator', () => {
    expect(formatDayWithRelative(MONDAY_9PM, { now: MONDAY_9PM, separator: ' at ' })).toBe(
      'Today at Monday, June 15',
    )
  })
})

describe('formatRelativeDateTime', () => {
  it('names today and yesterday, then falls back to the date', () => {
    expect(formatRelativeDateTime(MONDAY_9PM, MONDAY_9PM)).toBe('Today 9:05 PM')
    expect(formatRelativeDateTime(SUNDAY, MONDAY_9PM)).toBe('Yesterday 11:30 PM')
    expect(formatRelativeDateTime(new Date('2026-06-01T14:00:00'), MONDAY_9PM)).toBe(
      'Jun 1, 2026 2:00 PM',
    )
  })

  it('returns an empty string for an empty timestamp', () => {
    expect(formatRelativeDateTime('')).toBe('')
  })
})
