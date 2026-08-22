import { KBC } from '@/constants/theme'
import type { CalendarEvent } from '@/services/calendar'

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Matches both current "(super)" and legacy "(sup)" event title formats. */
export function isSupervisorEvent(summary: string | undefined): boolean {
  const s = summary?.toLowerCase() ?? ''
  return s.includes('(sup)') || s.includes('(super)')
}

export function isRequestedEvent(summary: string | undefined): boolean {
  return summary?.toLowerCase().includes('(requested)') ?? false
}

export function isAllDayEvent(e: CalendarEvent): boolean {
  return !!e.start?.date && !e.start?.dateTime
}

export function eventColor(event: CalendarEvent): string {
  if (isRequestedEvent(event.summary)) return KBC.purple
  if (isSupervisorEvent(event.summary)) return KBC.pink
  return KBC.cyan
}

/** True if a (possibly all-day, possibly timed) event covers the given local day. */
export function isEventOnDay(e: CalendarEvent, day: Date): boolean {
  if (e.start?.dateTime) return isSameDay(new Date(e.start.dateTime), day)
  if (e.start?.date && e.end?.date) {
    const [sy, sm, sd] = e.start.date.split('-').map(Number)
    const [ey, em, ed] = e.end.date.split('-').map(Number)
    const start = new Date(sy, sm - 1, sd)
    const end = new Date(ey, em - 1, ed) // exclusive
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate())
    return d >= start && d < end
  }
  return false
}

export function eventStartMs(e: CalendarEvent): number {
  if (e.start?.dateTime) return new Date(e.start.dateTime).getTime()
  if (e.start?.date) {
    const [y, m, d] = e.start.date.split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  }
  return 0
}

export function localDayStart(e: CalendarEvent): Date {
  if (e.start?.dateTime) {
    const d = new Date(e.start.dateTime)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }
  if (e.start?.date) {
    const [y, m, d] = e.start.date.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(0)
}

// ─── Timeline layout ─────────────────────────────────────────────────────────
// Ported from mobile/components/timeline-view.tsx.

export const TIMELINE_START_HOUR = 6
export const TIMELINE_END_HOUR = 24
export const TIMELINE_HOUR_HEIGHT = 64

function getEventMinutes(dateTime: string): number {
  const d = new Date(dateTime)
  return d.getHours() * 60 + d.getMinutes()
}

export function minutesToY(minutes: number): number {
  return ((minutes - TIMELINE_START_HOUR * 60) / 60) * TIMELINE_HOUR_HEIGHT
}

export type PositionedEvent = CalendarEvent & { top: number; height: number; column: number; numColumns: number }

/**
 * Lays out same-day timed events into a top/height/column grid: events that
 * overlap in time share a row, split into equal-width columns.
 */
export function layoutEvents(events: CalendarEvent[]): PositionedEvent[] {
  const sorted = [...events]
    .filter((e) => e.start?.dateTime && e.end?.dateTime)
    .sort((a, b) => getEventMinutes(a.start.dateTime!) - getEventMinutes(b.start.dateTime!))

  const positioned: PositionedEvent[] = []
  const groups: PositionedEvent[][] = []

  for (const event of sorted) {
    const startMin = getEventMinutes(event.start.dateTime!)
    const endMin = getEventMinutes(event.end.dateTime!)
    const top = minutesToY(startMin)
    const height = Math.max(((endMin - startMin) / 60) * TIMELINE_HOUR_HEIGHT, 28)
    let placed = false
    for (const group of groups) {
      const lastEnd = getEventMinutes(group[group.length - 1].end.dateTime!)
      if (startMin < lastEnd) {
        const col = group.length
        const pe: PositionedEvent = { ...event, top, height, column: col, numColumns: col + 1 }
        group.push(pe)
        group.forEach((e) => (e.numColumns = group.length))
        positioned.push(pe)
        placed = true
        break
      }
    }
    if (!placed) {
      const pe: PositionedEvent = { ...event, top, height, column: 0, numColumns: 1 }
      groups.push([pe])
      positioned.push(pe)
    }
  }
  return positioned
}

export type GymStatus = { open: true; until: Date; supervisorName?: string } | { open: false; next: Date | null }

/**
 * Derives the gym open/closed banner from supervisor-tagged calendar events —
 * ported from mobile/app/(tabs)/home.tsx's local getGymStatus(events). This is
 * the display mobile actually uses (as opposed to the Firestore gymStatus/current
 * doc, which mobile writes but never reads back for display — see
 * services/logbook.ts's getGymStatus() for that one).
 */
export function getGymStatusFromEvents(events: CalendarEvent[], now: Date = new Date()): GymStatus {
  function isSupEvent(e: CalendarEvent): boolean {
    if (isSupervisorEvent(e.summary)) return true
    const role = e.extendedProperties?.private?.createdByRole
    return role === 'supervisor' || role === 'admin'
  }
  const supers = events.filter(isSupEvent)
  const current = supers.find((e) => {
    if (!e.start?.dateTime || !e.end?.dateTime) return false
    return new Date(e.start.dateTime) <= now && now < new Date(e.end.dateTime)
  })
  if (current) {
    const openEnd = supers.reduce((latest, e) => {
      if (!e.start?.dateTime || !e.end?.dateTime) return latest
      const s = new Date(e.start.dateTime)
      const end = new Date(e.end.dateTime)
      return s <= now && end > latest ? end : latest
    }, new Date(current.end.dateTime!))
    const supervisorName = current.summary?.split(/[(+]/)[0]?.trim() || undefined
    return { open: true, until: openEnd, supervisorName }
  }
  const upcoming = supers
    .filter((e) => e.start?.dateTime && new Date(e.start.dateTime) > now)
    .sort((a, b) => new Date(a.start.dateTime!).getTime() - new Date(b.start.dateTime!).getTime())
  return { open: false, next: upcoming.length > 0 ? new Date(upcoming[0].start.dateTime!) : null }
}
