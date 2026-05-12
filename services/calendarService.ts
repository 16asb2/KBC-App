// Architecture: all Google Calendar WRITE operations (create, update, delete) use the
// KBC super-admin account token obtained via services/adminToken.ts.
// No individual user OAuth token is required for writes — this means no per-user
// calendar sharing is needed and all event changes appear under the admin account.
//
// READ operations (listUpcomingEvents) still use the signed-in user's token, which
// works because the KBC calendar is shared as read-only with all Google users.

import { getAdminCalendarToken } from '@/services/adminToken';

const CALENDAR_ID = process.env.EXPO_PUBLIC_GOOGLE_CALENDAR_ID!;
const BASE_URL    = 'https://www.googleapis.com/calendar/v3';

const PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!;
const API_KEY    = process.env.EXPO_PUBLIC_FIREBASE_API_KEY!;
const FS_BASE    = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ─── Types ───────────────────────────────────────────────────────────────────

export type CalendarParticipant = {
  uid:  string;
  name: string;
  role: string; // 'supervisor' | 'admin' | 'member' | 'non-member'
};

export type CalendarEvent = {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end:   { dateTime?: string; date?: string; timeZone?: string };
  colorId?: string;
  extendedProperties?: {
    private?: Record<string, string>;
    shared?:  Record<string, string>;
  };
};

export type SessionRequestData = {
  requestedTime: string;  // ISO start time
  requestedEnd:  string;  // ISO end time
  description?:  string;
};

export type CalendarUser = {
  uid:              string;
  name:             string;
  email:            string;
  isSupervisor:     boolean;
  isAdmin:          boolean;
  membershipStatus: string;
};

// ─── Firestore helpers ────────────────────────────────────────────────────────

type FVal = Record<string, any>;

function encode(val: any): FVal {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number')  return { integerValue: String(val) };
  if (typeof val === 'string')  return { stringValue: val };
  return { nullValue: null };
}

function encodeDoc(data: Record<string, any>) {
  const fields: Record<string, FVal> = {};
  for (const [k, v] of Object.entries(data)) fields[k] = encode(v);
  return { fields };
}

async function fsPatch(path: string, data: Record<string, any>) {
  const url = `${FS_BASE}/${path}?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encodeDoc(data)),
  });
  if (!res.ok) throw new Error(`Firestore PATCH ${res.status}`);
  return res.json();
}

// ─── Auth headers ─────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return {
    Authorization:  `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse participants JSON from extendedProperties, defaulting to empty array. */
function parseParticipants(event: CalendarEvent): CalendarParticipant[] {
  try {
    const raw = event.extendedProperties?.private?.participants;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Rebuild the event title from the participants list.
 * Format: "Artur (sup) + Garry + Andy"
 * Supervisors and admins get "(sup)" suffix; others get no label.
 */
function buildTitle(participants: CalendarParticipant[]): string {
  return participants
    .map(p => (p.role === 'supervisor' || p.role === 'admin') ? `${p.name} (sup)` : p.name)
    .join(' + ');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * List upcoming calendar events.
 * Uses the signed-in user's access token — no admin token needed for reads.
 */
export async function listUpcomingEvents(
  accessToken: string,
  days = 14,
): Promise<CalendarEvent[]> {
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const url = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`
    + `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;

  const res = await fetch(url, { headers: authHeaders(accessToken) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Calendar API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.items ?? [];
}

/**
 * Create a supervisor-tagged session on the KBC calendar.
 * Uses the admin account — no user token required.
 * Requires: creatorUser.isSupervisor || creatorUser.isAdmin
 */
export async function createSupervisorEvent(
  eventData: { start: string; end: string; description?: string; timeZone?: string; nameOverride?: string },
  creatorUser: CalendarUser,
): Promise<CalendarEvent> {
  if (!creatorUser.isSupervisor && !creatorUser.isAdmin) {
    throw new Error('Only supervisors and admins can create supervisor events.');
  }

  const participant: CalendarParticipant = {
    uid:  creatorUser.uid,
    name: eventData.nameOverride ?? creatorUser.name,
    role: creatorUser.isAdmin ? 'admin' : 'supervisor',
  };
  const title = buildTitle([participant]);
  const tz    = eventData.timeZone ?? 'America/Toronto';

  const body: Omit<CalendarEvent, 'id'> = {
    summary:     title,
    description: eventData.description,
    start: { dateTime: eventData.start, timeZone: tz },
    end:   { dateTime: eventData.end,   timeZone: tz },
    extendedProperties: {
      private: {
        createdByRole:   creatorUser.isAdmin ? 'admin' : 'supervisor',
        createdByUserId: creatorUser.uid,
        participants:    JSON.stringify([participant]),
      },
    },
  };

  const adminToken = await getAdminCalendarToken();
  const url = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(adminToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create event ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Create a member-requested session on the KBC calendar.
 * Uses the admin account — visible as a request pending supervisor fulfillment.
 * Requires: requesterUser.membershipStatus !== 'non-member'
 */
export async function createSessionRequest(
  eventData: { start: string; end: string; timeZone?: string; nameOverride?: string },
  requesterUser: CalendarUser,
): Promise<CalendarEvent> {
  if (requesterUser.membershipStatus === 'non-member') {
    throw new Error('Non-members cannot submit session requests.');
  }

  const displayName = eventData.nameOverride ?? requesterUser.name;
  const tz          = eventData.timeZone ?? 'America/Toronto';

  const body: Omit<CalendarEvent, 'id'> = {
    summary:     `${displayName} (requested)`,
    description: `requested_by:${requesterUser.email}`,
    start: { dateTime: eventData.start, timeZone: tz },
    end:   { dateTime: eventData.end,   timeZone: tz },
  };

  const adminToken = await getAdminCalendarToken();
  const url = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(adminToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create session request ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Join an existing supervisor session.
 * Callable by ANY authenticated user — appends them to the participants list
 * and rebuilds the event title via PATCH (preserves event ID).
 * Uses the admin account for the calendar write.
 */
export async function joinSession(
  existingEventId: string,
  joiningUser: CalendarUser,
  userAccessToken: string,
): Promise<string> {
  // Fetch existing event using the user's own token (read)
  const fetchUrl = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${existingEventId}`;
  const fetchRes = await fetch(fetchUrl, { headers: authHeaders(userAccessToken) });
  if (!fetchRes.ok) throw new Error(`Failed to fetch event ${fetchRes.status}`);
  const existing: CalendarEvent = await fetchRes.json();

  // Parse and update participants
  const participants = parseParticipants(existing);

  // Idempotent — don't add twice
  if (participants.some(p => p.uid === joiningUser.uid)) {
    return existingEventId;
  }

  const newParticipant: CalendarParticipant = {
    uid:  joiningUser.uid,
    name: joiningUser.name,
    role: joiningUser.isAdmin        ? 'admin'
        : joiningUser.isSupervisor   ? 'supervisor'
        : joiningUser.membershipStatus !== 'non-member' ? 'member'
        : 'non-member',
  };
  const updatedParticipants = [...participants, newParticipant];
  const updatedTitle        = buildTitle(updatedParticipants);

  // PATCH the existing event (preserves event ID — no delete+create)
  const adminToken = await getAdminCalendarToken();
  const patchRes = await fetch(
    `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${existingEventId}`,
    {
      method: 'PATCH',
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        summary: updatedTitle,
        extendedProperties: {
          private: {
            ...(existing.extendedProperties?.private ?? {}),
            participants: JSON.stringify(updatedParticipants),
          },
        },
      }),
    },
  );
  if (!patchRes.ok) {
    const text = await patchRes.text();
    throw new Error(`Failed to update event ${patchRes.status}: ${text}`);
  }

  return existingEventId;
}

/**
 * Update an existing supervisor session (time, title, supervisor flag).
 * Uses the admin account.
 * Requires: requestingUser.isSupervisor || requestingUser.isAdmin
 */
export async function updateSupervisorEvent(
  eventId: string,
  patch: {
    start?:        string;
    end?:          string;
    timeZone?:     string;
    nameOverride?: string;
    isSupervisor?: boolean;
  },
  requestingUser: CalendarUser,
): Promise<CalendarEvent> {
  if (!requestingUser.isSupervisor && !requestingUser.isAdmin) {
    throw new Error('Only supervisors and admins can edit supervisor events.');
  }

  const body: Record<string, any> = {};

  if (patch.start)  body.start = { dateTime: patch.start, timeZone: patch.timeZone ?? 'America/Toronto' };
  if (patch.end)    body.end   = { dateTime: patch.end,   timeZone: patch.timeZone ?? 'America/Toronto' };

  if (patch.nameOverride !== undefined || patch.isSupervisor !== undefined) {
    const name   = patch.nameOverride ?? requestingUser.name;
    const isSup  = patch.isSupervisor ?? (requestingUser.isSupervisor || requestingUser.isAdmin);
    body.summary = isSup ? `${name} (sup)` : name;
  }

  const adminToken = await getAdminCalendarToken();
  const url = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${eventId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: authHeaders(adminToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update event ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Delete a supervisor session.
 * Uses the admin account.
 * Requires: requestingUser.isSupervisor || requestingUser.isAdmin
 */
export async function deleteSupervisorEvent(
  eventId: string,
  requestingUser: CalendarUser,
): Promise<void> {
  if (!requestingUser.isSupervisor && !requestingUser.isAdmin) {
    throw new Error('Only supervisors and admins can delete supervisor events.');
  }
  const adminToken = await getAdminCalendarToken();
  const url = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${eventId}`;
  const res = await fetch(url, { method: 'DELETE', headers: authHeaders(adminToken) });
  if (!res.ok && res.status !== 204) throw new Error(`Failed to delete event: ${res.status}`);
}

/**
 * Create a special (non-session) event — competitions, workshops, etc.
 * Free-form title; no participant tracking. Uses the admin account.
 * Requires: requestingUser.isSupervisor || requestingUser.isAdmin
 * For all-day events pass allDay:true and YYYY-MM-DD date strings (end date is exclusive).
 */
export async function createSpecialEvent(
  eventData: { summary: string; start: string; end: string; timeZone?: string; allDay?: boolean },
  requestingUser: CalendarUser,
): Promise<CalendarEvent> {
  if (!requestingUser.isSupervisor && !requestingUser.isAdmin) {
    throw new Error('Only supervisors and admins can create special events.');
  }
  const body: Record<string, any> = { summary: eventData.summary };
  if (eventData.allDay) {
    body.start = { date: eventData.start };
    body.end   = { date: eventData.end };
  } else {
    const tz = eventData.timeZone ?? 'America/Toronto';
    body.start = { dateTime: eventData.start, timeZone: tz };
    body.end   = { dateTime: eventData.end,   timeZone: tz };
  }
  const adminToken = await getAdminCalendarToken();
  const url = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(adminToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create special event ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Submit a session request to Firestore (does NOT write to Google Calendar).
 * Use createSessionRequest() to also put it on the calendar.
 * Requires: requesterUser.membershipStatus !== 'non-member'
 */
export async function createMemberRequest(
  requestData: SessionRequestData,
  requesterUser: CalendarUser,
): Promise<void> {
  if (requesterUser.membershipStatus === 'non-member') {
    throw new Error('Non-members cannot submit session requests.');
  }

  const id  = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  await fsPatch(`sessionRequests/${id}`, {
    requesterUid:   requesterUser.uid,
    requesterName:  requesterUser.name,
    requesterEmail: requesterUser.email,
    requestedTime:  requestData.requestedTime,
    requestedEnd:   requestData.requestedEnd,
    description:    requestData.description ?? '',
    status:         'pending',
    createdAt:      now,
  });
}
