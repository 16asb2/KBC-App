import { auth } from '@/lib/firebase'
import { isRequestedEvent, isSupervisorEvent } from '@/domain/calendarEvent'
import {
  buildTitle,
  classifyOverlap,
  participantsFor,
  subtractIntervals,
} from '@/domain/calendarSession'

// Reads go through the same admin-mediated token service mobile/ uses for
// WRITES — a deliberate divergence from mobile/services/calendarService.ts,
// which reads with the signed-in user's own Google OAuth access token
// instead. That works for mobile because Google Sign-In already gives it a
// long-lived, refreshable access token for the calendar.events scope. Doing
// the same on web would mean requesting that scope during signInWithPopup
// and then re-implementing Google Identity Services' separate silent-refresh
// flow, since Firebase Auth's JS SDK only hands you a Google OAuth access
// token once, at sign-in, and never refreshes it. Reusing the admin-mediated
// path avoids all of that — the KBC calendar is shared read-only with any
// Google account, so the admin token can read it exactly as well as a
// member's own token could, with fewer moving parts.
//
// NOTE on which service that actually is: VITE_CLOUD_FUNCTIONS_BASE_URL is
// named after functions/getAdminCalendarToken, but both it and mobile's
// EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL point at the Cloudflare Worker in
// worker/ instead. That Cloud Function has never been deployed (the Cloud
// Functions API isn't enabled on the project) — worker/ is the live one.
// It accepts the Firebase ID token sent below; see worker/src/index.ts.
const CALENDAR_ID = import.meta.env.VITE_GOOGLE_CALENDAR_ID
const CLOUD_FN_BASE = import.meta.env.VITE_CLOUD_FUNCTIONS_BASE_URL
const BASE_URL = 'https://www.googleapis.com/calendar/v3'

export type CalendarParticipant = {
  uid: string
  name: string
  role: string // 'supervisor' | 'admin' | 'member'
}

export type CalendarEvent = {
  id: string
  summary?: string
  description?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  colorId?: string
  extendedProperties?: {
    private?: Record<string, string>
    shared?: Record<string, string>
  }
}

let cachedToken: string | null = null
let cachedExpiresAt = 0

async function getAdminCalendarToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && now < cachedExpiresAt) return cachedToken

  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')
  const idToken = await user.getIdToken()

  const res = await fetch(`${CLOUD_FN_BASE}/getAdminCalendarToken`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Admin calendar token error ${res.status}: ${body}`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = data.access_token
  cachedExpiresAt = now + (data.expires_in - 60) * 1000
  return cachedToken
}

/** List calendar events in a window around now. Matches mobile's ScheduleProvider defaults. */
export async function listUpcomingEvents(days = 60, pastDays = 14): Promise<CalendarEvent[]> {
  const token = await getAdminCalendarToken()
  const timeMin = new Date(Date.now() - pastDays * 24 * 60 * 60 * 1000).toISOString()
  const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  const url =
    `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events` +
    `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Calendar API error ${res.status}: ${body}`)
  }
  const data = await res.json()
  return data.items ?? []
}

// ─── Writes ──────────────────────────────────────────────────────────────────
//
// Ported from mobile/services/calendarService.ts. Every write goes through the
// admin token, so no member needs the KBC calendar shared with them and all
// changes appear under the KBC admin account.
//
// One divergence from mobile: it read individual events with the signed-in
// user's own Google OAuth token and only wrote with the admin one. This app
// never holds a user Calendar token at all (see the note at the top of this
// file), so reads here use the admin token too.
//
// NOTE ON SCOPE: these need the Worker's refresh token to carry
// `calendar.events`. It was narrowed to `calendar.readonly` while the app was
// read-only — under that scope every function below fails with 403
// insufficientPermissions. See worker/scripts/get-admin-token.js.

const TIME_ZONE = 'America/Toronto'

export type CalendarUser = {
  uid: string
  name: string
  isSupervisor: boolean
  isAdmin: boolean
}

function roleOf(user: CalendarUser): CalendarParticipant['role'] {
  return user.isAdmin ? 'admin' : user.isSupervisor ? 'supervisor' : 'member'
}

function requirePrivileged(user: CalendarUser, action: string): void {
  // firestore.rules cannot guard Google Calendar, and the Worker hands the same
  // token to anyone signed in — so this is the only check there is. It is still
  // client-side: a determined member could call the Calendar API directly with
  // a token the Worker gave them. Moving writes behind the Worker is the fix,
  // noted as an open question in DESIGN.md.
  if (!user.isSupervisor && !user.isAdmin) {
    throw new Error(`Only supervisors and admins can ${action}.`)
  }
}

async function calendarFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAdminCalendarToken()
  return fetch(`${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

async function calendarJson<T>(path: string, init: RequestInit, what: string): Promise<T> {
  const res = await calendarFetch(path, init)
  if (!res.ok) {
    const body = await res.text()
    if (res.status === 403 && body.includes('insufficientPermissions')) {
      throw new Error(
        `Cannot ${what}: the KBC calendar token is read-only. Re-mint it with the ` +
          `calendar.events scope — see worker/scripts/get-admin-token.js.`,
      )
    }
    throw new Error(`Failed to ${what} (${res.status}): ${body}`)
  }
  return (await res.json()) as T
}

export async function getEvent(eventId: string): Promise<CalendarEvent> {
  return calendarJson<CalendarEvent>(`/events/${eventId}`, {}, 'load that event')
}

async function listEventsInRange(timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
  const q =
    `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
    `&singleEvents=true&orderBy=startTime`
  const data = await calendarJson<{ items?: CalendarEvent[] }>(`/events${q}`, {}, 'load events')
  return data.items ?? []
}

/** Replace an event's roster and retitle it to match. */
async function patchParticipants(
  event: CalendarEvent,
  participants: CalendarParticipant[],
): Promise<void> {
  await calendarJson(
    `/events/${event.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        summary: buildTitle(participants),
        extendedProperties: {
          private: {
            ...(event.extendedProperties?.private ?? {}),
            participants: JSON.stringify(participants),
          },
        },
      }),
    },
    'update that session',
  )
}

async function patchEventTimes(eventId: string, start: string, end: string, tz: string) {
  await calendarJson(
    `/events/${eventId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        start: { dateTime: start, timeZone: tz },
        end: { dateTime: end, timeZone: tz },
      }),
    },
    'adjust that request',
  )
}

async function deleteEventRaw(eventId: string): Promise<void> {
  const res = await calendarFetch(`/events/${eventId}`, { method: 'DELETE' })
  // 410 means it was already gone, which is the outcome we wanted anyway.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Failed to delete event (${res.status}): ${await res.text()}`)
  }
}

async function createRawRequest(name: string, start: string, end: string, tz: string) {
  await calendarJson(
    '/events',
    {
      method: 'POST',
      body: JSON.stringify({
        summary: `${name} (requested)`,
        start: { dateTime: start, timeZone: tz },
        end: { dateTime: end, timeZone: tz },
      }),
    },
    'create that request',
  )
}

/**
 * Trim or drop member requests that a new supervisor slot now covers.
 *
 * Best-effort: the slot itself already exists by the time this runs, so a
 * failure here leaves a redundant request on the calendar rather than losing
 * the session.
 */
async function reconcileRequestsWithSlot(
  slotStart: Date,
  slotEnd: Date,
  tz: string,
): Promise<void> {
  const buffer = 60 * 60 * 1000
  const events = await listEventsInRange(
    new Date(slotStart.getTime() - buffer).toISOString(),
    new Date(slotEnd.getTime() + buffer).toISOString(),
  )
  const requests = events.filter(
    (e) => isRequestedEvent(e.summary) && e.start.dateTime && e.end.dateTime,
  )

  for (const req of requests) {
    const reqStart = new Date(req.start.dateTime!)
    const reqEnd = new Date(req.end.dateTime!)
    const kind = classifyOverlap(
      { start: reqStart, end: reqEnd },
      { start: slotStart, end: slotEnd },
    )
    if (kind === 'none') continue

    const name = req.summary?.replace(/\s*\(requested\)/i, '').trim() ?? ''
    const reqTz = req.start.timeZone ?? tz

    if (kind === 'contained') {
      await deleteEventRaw(req.id)
    } else if (kind === 'spans') {
      // The slot splits the request in two; Calendar has no split, so replace it.
      await deleteEventRaw(req.id)
      await createRawRequest(name, req.start.dateTime!, slotStart.toISOString(), reqTz)
      await createRawRequest(name, slotEnd.toISOString(), req.end.dateTime!, reqTz)
    } else if (kind === 'trim-end') {
      await patchEventTimes(req.id, req.start.dateTime!, slotStart.toISOString(), reqTz)
    } else {
      await patchEventTimes(req.id, slotEnd.toISOString(), req.end.dateTime!, reqTz)
    }
  }
}

/** Open a supervised climbing session. */
export async function createSupervisorSession(
  data: { start: string; end: string; description?: string; nameOverride?: string },
  user: CalendarUser,
): Promise<CalendarEvent> {
  requirePrivileged(user, 'open a climbing session')
  const participant: CalendarParticipant = {
    uid: user.uid,
    name: data.nameOverride ?? user.name,
    role: roleOf(user),
  }
  const created = await calendarJson<CalendarEvent>(
    '/events',
    {
      method: 'POST',
      body: JSON.stringify({
        summary: buildTitle([participant]),
        description: data.description,
        start: { dateTime: data.start, timeZone: TIME_ZONE },
        end: { dateTime: data.end, timeZone: TIME_ZONE },
        extendedProperties: {
          private: {
            createdByRole: participant.role,
            createdByUserId: user.uid,
            participants: JSON.stringify([participant]),
          },
        },
      }),
    },
    'open that session',
  )

  try {
    await reconcileRequestsWithSlot(new Date(data.start), new Date(data.end), TIME_ZONE)
  } catch (e) {
    console.warn('[Calendar] Could not reconcile requests against the new slot:', e)
  }
  return created
}

/**
 * Ask for a session at a time no supervisor has covered.
 *
 * Any part already covered is dropped, so asking for 4–8pm when a supervisor
 * has 5–6pm creates two requests either side rather than one overlapping block.
 * Throws if the whole span is already covered — there is nothing to ask for.
 */
export async function createSessionRequest(
  data: { start: string; end: string; nameOverride?: string },
  user: CalendarUser,
): Promise<CalendarEvent[]> {
  const start = new Date(data.start)
  const end = new Date(data.end)
  const existing = await listEventsInRange(data.start, data.end)
  const covered = existing
    .filter((e) => isSupervisorEvent(e.summary) && e.start.dateTime && e.end.dateTime)
    .map((e) => ({ start: new Date(e.start.dateTime!), end: new Date(e.end.dateTime!) }))

  const gaps = subtractIntervals(start, end, covered)
  if (gaps.length === 0) {
    throw new Error('A supervisor already covers that whole time — join their session instead.')
  }

  const name = data.nameOverride ?? user.name
  const created: CalendarEvent[] = []
  for (const gap of gaps) {
    created.push(
      await calendarJson<CalendarEvent>(
        '/events',
        {
          method: 'POST',
          body: JSON.stringify({
            summary: `${name} (requested)`,
            start: { dateTime: gap.start.toISOString(), timeZone: TIME_ZONE },
            end: { dateTime: gap.end.toISOString(), timeZone: TIME_ZONE },
            extendedProperties: {
              private: { createdByRole: 'member', createdByUserId: user.uid, type: 'request' },
            },
          }),
        },
        'send that request',
      ),
    )
  }
  return created
}

/** Add yourself to an existing session. Idempotent. */
export async function joinSession(eventId: string, user: CalendarUser): Promise<void> {
  const existing = await getEvent(eventId)
  const participants = participantsFor(existing)

  // Match on name as well as uid: legacy events carry synthetic uids, so the
  // name is the only way to recognise someone already listed on one.
  const name = user.name.toLowerCase()
  if (participants.some((p) => p.uid === user.uid || p.name.toLowerCase() === name)) return

  await patchParticipants(existing, [
    ...participants,
    { uid: user.uid, name: user.name, role: roleOf(user) },
  ])
}

/** Remove yourself from a session. */
export async function leaveSession(eventId: string, user: CalendarUser): Promise<void> {
  const existing = await getEvent(eventId)
  const participants = participantsFor(existing)
  if (participants.length === 0) {
    throw new Error('Cannot leave this session — its participant list is unavailable.')
  }

  const name = user.name.toLowerCase()
  const remaining = participants.filter((p) => p.uid !== user.uid && p.name.toLowerCase() !== name)
  if (remaining.length === participants.length) return // wasn't on it
  if (remaining.length === 0) {
    throw new Error('You are the only person on this session — delete it instead of leaving.')
  }
  await patchParticipants(existing, remaining)
}

/** Change a session's time or description. */
export async function updateSession(
  eventId: string,
  data: { start: string; end: string; description?: string },
  user: CalendarUser,
): Promise<void> {
  requirePrivileged(user, 'change a session')
  await calendarJson(
    `/events/${eventId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        start: { dateTime: data.start, timeZone: TIME_ZONE },
        end: { dateTime: data.end, timeZone: TIME_ZONE },
        ...(data.description !== undefined ? { description: data.description } : {}),
      }),
    },
    'change that session',
  )
}

export async function deleteSession(eventId: string, user: CalendarUser): Promise<void> {
  requirePrivileged(user, 'delete a session')
  await deleteEventRaw(eventId)
}

/** A named event — Ladies Night, a competition, a closure — rather than a session. */
export async function createSpecialEvent(
  data: { summary: string; start: string; end: string; allDay?: boolean },
  user: CalendarUser,
): Promise<CalendarEvent> {
  requirePrivileged(user, 'create a special event')
  const times = data.allDay
    ? { start: { date: data.start }, end: { date: data.end } }
    : {
        start: { dateTime: data.start, timeZone: TIME_ZONE },
        end: { dateTime: data.end, timeZone: TIME_ZONE },
      }
  return calendarJson<CalendarEvent>(
    '/events',
    {
      method: 'POST',
      body: JSON.stringify({
        summary: data.summary,
        ...times,
        extendedProperties: {
          private: {
            createdByRole: roleOf(user),
            createdByUserId: user.uid,
            type: 'specialEvent',
          },
        },
      }),
    },
    'create that event',
  )
}
