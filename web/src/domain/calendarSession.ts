import type { CalendarEvent, CalendarParticipant } from '@/services/calendar'

// Pure logic behind calendar sessions, ported from the helpers embedded in
// mobile/services/calendarService.ts. Pulled out so the parts that are easy to
// get quietly wrong — who is on an event, and how a member's request is trimmed
// when a supervisor covers part of it — can be tested without touching Google.

// ─── Participants ────────────────────────────────────────────────────────────
//
// A session's roster lives in extendedProperties.private.participants as a JSON
// string, and the event title is derived from it. The title is what humans see
// in Google Calendar, so the two must be kept in step on every write.

export function parseParticipants(event: CalendarEvent): CalendarParticipant[] {
  try {
    const raw = event.extendedProperties?.private?.participants
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** "Artur (super) + Garry + Andy" — supervisors and admins are marked, members aren't. */
export function buildTitle(participants: CalendarParticipant[]): string {
  return participants
    .map((p) => (p.role === 'supervisor' || p.role === 'admin' ? `${p.name} (super)` : p.name))
    .join(' + ')
}

/**
 * Recover a roster from an event title alone.
 *
 * Events created before participants were tracked have no extendedProperties,
 * and the KBC calendar still holds them. Their uids are synthetic and prefixed
 * `legacy_`, so a member can't be matched against one by uid — joining such an
 * event appends rather than deduplicates, which is the safe direction.
 */
export function reconstructParticipantsFromTitle(summary: string): CalendarParticipant[] {
  return summary.split(' + ').map((part, i) => {
    const trimmed = part.trim()
    const isSup = /\(sup(er)?\)$/i.test(trimmed)
    // "(requested)" comes off too — it is a status marker on the title, not
    // part of anyone's name, and leaving it on shows "Garry (requested)" as the
    // person in the roster.
    const name = trimmed.replace(/\s*\((?:sup(?:er)?|requested)\)$/i, '').trim()
    return {
      uid: `legacy_${i}_${name.toLowerCase().replace(/\s+/g, '_')}`,
      name,
      role: isSup ? 'supervisor' : 'member',
    }
  })
}

/** The roster for an event, falling back to its title for legacy events. */
export function participantsFor(event: CalendarEvent): CalendarParticipant[] {
  const tracked = parseParticipants(event)
  if (tracked.length > 0) return tracked
  return event.summary ? reconstructParticipantsFromTitle(event.summary) : []
}

export function isParticipant(event: CalendarEvent, uid: string): boolean {
  return participantsFor(event).some((p) => p.uid === uid)
}

/** True once nobody with supervisor or admin role is left on the event. */
export function hasSupervisor(participants: CalendarParticipant[]): boolean {
  return participants.some((p) => p.role === 'supervisor' || p.role === 'admin')
}

// ─── Interval arithmetic ─────────────────────────────────────────────────────

export type Interval = { start: Date; end: Date }

/**
 * `start`–`end` with every interval in `toSubtract` removed.
 *
 * Used when a member asks for a session: any stretch already covered by a
 * supervisor is dropped, and a request is only created for what's left. An
 * empty result means the whole span is already covered.
 */
export function subtractIntervals(start: Date, end: Date, toSubtract: Interval[]): Interval[] {
  const sorted = [...toSubtract].sort((a, b) => a.start.getTime() - b.start.getTime())
  let remaining: Interval[] = [{ start, end }]
  for (const sub of sorted) {
    const next: Interval[] = []
    for (const iv of remaining) {
      if (sub.end <= iv.start || sub.start >= iv.end) {
        next.push(iv) // disjoint — keep whole
      } else {
        if (iv.start < sub.start) next.push({ start: iv.start, end: sub.start })
        if (iv.end > sub.end) next.push({ start: sub.end, end: iv.end })
      }
    }
    remaining = next
  }
  return remaining
}

export type OverlapKind =
  /** Request and slot don't touch — leave the request alone. */
  | 'none'
  /** Slot swallows the request — the request is redundant, delete it. */
  | 'contained'
  /** Request extends past both ends — split into two around the slot. */
  | 'spans'
  /** Request starts first — trim its end back to the slot's start. */
  | 'trim-end'
  /** Request ends later — trim its start forward to the slot's end. */
  | 'trim-start'

/**
 * How a member's outstanding request should be reconciled against a supervisor
 * slot that now covers part of the same time.
 *
 * Split out from the network code so every branch is testable: the original
 * decided this inline while issuing deletes and patches, which meant the only
 * way to check a case was to run it against a real calendar.
 */
export function classifyOverlap(request: Interval, slot: Interval): OverlapKind {
  if (request.end <= slot.start || request.start >= slot.end) return 'none'
  if (request.start >= slot.start && request.end <= slot.end) return 'contained'
  if (request.start < slot.start && request.end > slot.end) return 'spans'
  if (request.start < slot.start) return 'trim-end'
  return 'trim-start'
}
