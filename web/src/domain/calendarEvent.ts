import { KBC } from '@/constants/theme'
import type { CalendarEvent } from '@/services/calendar'

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// ─── Classification ──────────────────────────────────────────────────────────
//
// The KBC calendar holds two different things and the app has to tell them
// apart, because only one of them is joinable:
//
//   Climb session — a supervised slot. Its title IS its roster, built by
//     domain/calendarSession.ts#buildTitle: "Artur (super)", or
//     "Artur (super) + Garry + Andy" once people join, or
//     "Artur (super) + Bea (super)" with two supervisors on. So a session is
//     recognised by *any* " + "-separated segment ending in "(super)".
//   Special event — Ladies Night, a comp, a closure. Anything else on the
//     calendar, including events put there directly in Google Calendar.
//
// The suffix has to be anchored to the end of a segment, not merely present
// somewhere in the title: "Ladies Night (super fun)" is a special event.

const SUPER_SUFFIX = /\((?:sup|super)\)\s*$/i
const REQUESTED_SUFFIX = /\(requested\)\s*$/i

function titleSegments(summary: string | undefined): string[] {
  return (summary ?? '').split('+').map((s) => s.trim())
}

/** Matches both the current "(super)" and legacy "(sup)" roster suffixes. */
export function isSupervisorEvent(summary: string | undefined): boolean {
  return titleSegments(summary).some((part) => SUPER_SUFFIX.test(part))
}

export function isRequestedEvent(summary: string | undefined): boolean {
  return titleSegments(summary).some((part) => REQUESTED_SUFFIX.test(part))
}

export type EventKind =
  /** A supervised climbing session — joinable. */
  | 'session'
  /** A member's ask for a session no supervisor covers yet — joinable. */
  | 'request'
  /** Anything else on the calendar — informational, not joinable. */
  | 'special'

/**
 * What kind of thing this calendar entry is.
 *
 * `extendedProperties.private.type` is authoritative when the app wrote it,
 * which it does for everything created in-app; the title format is the fallback
 * for events created straight in Google Calendar, and for the older events on
 * the KBC calendar that predate extended properties entirely.
 */
export function eventKind(event: CalendarEvent): EventKind {
  const type = event.extendedProperties?.private?.type
  if (type === 'specialEvent') return 'special'
  if (type === 'request') return 'request'
  if (isRequestedEvent(event.summary)) return 'request'
  if (isSupervisorEvent(event.summary)) return 'session'
  return 'special'
}

/** True for the two kinds you can join, leave and be listed on. */
export function isClimbSession(event: CalendarEvent): boolean {
  return eventKind(event) !== 'special'
}

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  session: 'Climb Session',
  request: 'Session Request',
  special: 'Special Event',
}

export function isAllDayEvent(e: CalendarEvent): boolean {
  return !!e.start?.date && !e.start?.dateTime
}

export function eventColor(event: CalendarEvent): string {
  switch (eventKind(event)) {
    case 'request':
      return KBC.purple
    case 'session':
      return KBC.pink
    default:
      return KBC.cyan
  }
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

/** Shortest block the timeline will draw, and the shortest it will collide as. */
const MIN_EVENT_MINUTES = 20

function getEventMinutes(dateTime: string): number {
  const d = new Date(dateTime)
  return d.getHours() * 60 + d.getMinutes()
}

export function minutesToY(minutes: number): number {
  return ((minutes - TIMELINE_START_HOUR * 60) / 60) * TIMELINE_HOUR_HEIGHT
}

/** Inverse of minutesToY — turns a click offset in the grid back into a time. */
export function yToMinutes(y: number): number {
  return (y / TIMELINE_HOUR_HEIGHT) * 60 + TIMELINE_START_HOUR * 60
}

export type PositionedEvent = CalendarEvent & {
  top: number
  height: number
  /** Leftmost column index this event occupies, within its overlap cluster. */
  column: number
  /** How many columns it spans — >1 when the columns to its right are free. */
  span: number
  /** Columns in the cluster, i.e. what `column`/`span` are a fraction of. */
  numColumns: number
}

type Slot = {
  event: CalendarEvent
  startMin: number
  endMin: number
  column: number
}

/**
 * Minutes-from-midnight for an event on the day being displayed.
 *
 * An event running past midnight reports an end *earlier* than its start, so it
 * is clamped to the bottom of the timeline rather than drawn with a negative
 * height. Very short events get a floor so they stay legible, and so two
 * back-to-back 10-minute slots aren't packed into one column too narrow to read.
 */
function slotMinutes(e: CalendarEvent): { startMin: number; endMin: number } {
  const startMin = getEventMinutes(e.start.dateTime!)
  const rawEnd = getEventMinutes(e.end.dateTime!)
  const endMin = rawEnd <= startMin ? TIMELINE_END_HOUR * 60 : rawEnd
  return { startMin, endMin: Math.max(endMin, startMin + MIN_EVENT_MINUTES) }
}

/**
 * Lay same-day timed events out into a top/height/column grid.
 *
 * Events are grouped into *clusters* of transitively-overlapping events, and
 * within a cluster each takes the leftmost column free at its start time — the
 * standard day-view packing. It then widens to the right across any columns
 * nothing else needs while it is on screen, so an event only pays for the
 * narrowness its neighbours actually cause.
 *
 * The version this replaces compared each event against only the *last* event
 * added to a group, so a long event with several short ones inside it — the
 * common case here, a three-hour supervisor slot with requests underneath —
 * stopped counting as overlapping after the first, and every later event was
 * drawn on top of it at the same width and offset.
 */
export function layoutEvents(events: CalendarEvent[]): PositionedEvent[] {
  const slots: Slot[] = events
    .filter((e) => e.start?.dateTime && e.end?.dateTime)
    .map((e) => ({ event: e, ...slotMinutes(e), column: 0 }))
    // Longest-first among equal starts, so the enclosing event takes column 0.
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)

  const positioned: PositionedEvent[] = []

  for (const cluster of clusterByOverlap(slots)) {
    // columnEnds[c] is the end time of the last slot placed in column c.
    const columnEnds: number[] = []
    for (const slot of cluster) {
      let col = columnEnds.findIndex((end) => end <= slot.startMin)
      if (col === -1) col = columnEnds.length
      slot.column = col
      columnEnds[col] = slot.endMin
    }
    const numColumns = columnEnds.length

    for (const slot of cluster) {
      let span = 1
      while (slot.column + span < numColumns && !blocks(cluster, slot, slot.column + span)) {
        span++
      }
      positioned.push({
        ...slot.event,
        top: minutesToY(slot.startMin),
        height: ((slot.endMin - slot.startMin) / 60) * TIMELINE_HOUR_HEIGHT,
        column: slot.column,
        span,
        numColumns,
      })
    }
  }

  return positioned
}

/** Is any other slot in `column` live at the same time as `slot`? */
function blocks(cluster: Slot[], slot: Slot, column: number): boolean {
  return cluster.some(
    (other) =>
      other !== slot &&
      other.column === column &&
      other.startMin < slot.endMin &&
      other.endMin > slot.startMin,
  )
}

/** Split start-sorted slots into runs that transitively overlap in time. */
function clusterByOverlap(slots: Slot[]): Slot[][] {
  const clusters: Slot[][] = []
  let current: Slot[] = []
  let clusterEnd = -Infinity

  for (const slot of slots) {
    if (current.length > 0 && slot.startMin >= clusterEnd) {
      clusters.push(current)
      current = []
    }
    current.push(slot)
    clusterEnd = Math.max(clusterEnd, slot.endMin)
  }
  if (current.length > 0) clusters.push(current)
  return clusters
}

export type GymStatus = { open: true; until: Date; supervisorName?: string } | { open: false; next: Date | null }

/**
 * Derives the gym open/closed banner from supervisor-tagged calendar events —
 * ported from mobile/app/(tabs)/home.tsx's local getGymStatus(events). This is
 * the display mobile actually uses (as opposed to the Firestore gymStatus/current
 * doc, which mobile writes but never reads back for display — see
 * services/logbook.ts's getGymStatus() for that one).
 *
 * Only real climb sessions count. mobile also accepted any event whose
 * `createdByRole` was supervisor or admin, which quietly included every special
 * event a supervisor added — so putting a comp or a closure on the calendar
 * reported the gym as open and staffed.
 */
export function getGymStatusFromEvents(events: CalendarEvent[], now: Date = new Date()): GymStatus {
  const supers = events.filter((e) => eventKind(e) === 'session')
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
