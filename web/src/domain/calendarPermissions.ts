import { eventKind, isClimbSession } from '@/domain/calendarEvent'
import { participantsFor } from '@/domain/calendarSession'
import type { CalendarEvent } from '@/services/calendar'

/**
 * Who may do what to a calendar entry.
 *
 * The rules, in full:
 *
 *  - **Everyone** signed in can view every event on the calendar, open its
 *    details, and join or leave a climb session (a supervisor's slot, or
 *    another member's outstanding request).
 *  - **Supervisors and admins** — `isPrivileged`, since every admin counts as a
 *    supervisor — can create climb sessions and special events, and can edit or
 *    delete anything on the calendar.
 *  - **Everyone else** can create a session request, and edit or delete *their
 *    own* request. Nothing else: someone else's request, a supervisor's
 *    session, and every special event are read-only to them.
 *
 * This is UX only, exactly like the client-side role checks elsewhere in the
 * app. The real enforcement problem is that the Worker hands a write-capable
 * Calendar token to any signed-in user — see the open question in DESIGN.md
 * about moving calendar writes behind the Worker.
 */
export type CalendarActor = {
  uid: string
  name: string
  /** isPrivileged(): supervisor or admin. */
  privileged: boolean
}

/**
 * Did this actor put this event on the calendar?
 *
 * `createdByUserId` is what the app writes and the answer whenever it is there.
 * The name fallback covers the events already on the KBC calendar from before
 * extended properties: their reconstructed participants carry synthetic
 * `legacy_` uids, so a uid can never match one and the title is all there is.
 */
export function isOwnEvent(event: CalendarEvent, actor: CalendarActor): boolean {
  const createdBy = event.extendedProperties?.private?.createdByUserId
  if (createdBy) return createdBy === actor.uid

  const name = actor.name.trim().toLowerCase()
  if (!name) return false
  return participantsFor(event).some((p) => p.name.trim().toLowerCase() === name)
}

/** Sessions and requests are joinable; special events are not. */
export function canJoinEvent(event: CalendarEvent): boolean {
  return isClimbSession(event)
}

export function canEditEvent(event: CalendarEvent, actor: CalendarActor): boolean {
  if (actor.privileged) return true
  return eventKind(event) === 'request' && isOwnEvent(event, actor)
}

export function canDeleteEvent(event: CalendarEvent, actor: CalendarActor): boolean {
  // Same surface as editing: a member's own request is theirs to move or drop,
  // and everything else needs a supervisor.
  return canEditEvent(event, actor)
}

/** Which of the three create flows this actor gets from a "+" or an empty slot. */
export function defaultCreateKind(actor: CalendarActor): 'session' | 'request' {
  return actor.privileged ? 'session' : 'request'
}
