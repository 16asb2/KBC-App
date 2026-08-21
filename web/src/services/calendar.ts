import { auth } from '@/lib/firebase'

// Reads go through the same admin-mediated Cloud Function mobile/ uses for
// WRITES (functions/getAdminCalendarToken) — a deliberate divergence from
// mobile/services/calendarService.ts, which reads with the signed-in user's
// own Google OAuth access token instead. That works for mobile because
// Google Sign-In already gives it a long-lived, refreshable access token for
// the calendar.events scope. Doing the same on web would mean requesting
// that scope during signInWithPopup and then re-implementing Google Identity
// Services' separate silent-refresh flow, since Firebase Auth's JS SDK only
// hands you a Google OAuth access token once, at sign-in, and never refreshes
// it. Reusing the admin-mediated path avoids all of that — the KBC calendar
// is shared read-only with any Google account, so the admin token can read
// it exactly as well as a member's own token could, with fewer moving parts.
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
