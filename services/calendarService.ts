// NOTE: All Google Calendar access is mediated through the admin account.
// No individual user Google accounts should have direct edit access to the KBC calendar.
// If any were previously granted, revoke them manually in Google Calendar settings.

// Architecture note: all functions accept an accessToken from the signed-in user.
// For write operations (create, update, delete) the token must belong to a user
// who has write access to the KBC calendar (supervisors / admins).

const CALENDAR_ID = process.env.EXPO_PUBLIC_GOOGLE_CALENDAR_ID!;
const BASE_URL    = 'https://www.googleapis.com/calendar/v3';

const PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!;
const API_KEY    = process.env.EXPO_PUBLIC_FIREBASE_API_KEY!;
const FS_BASE    = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const QUERY_URL  = `${FS_BASE}:runQuery?key=${API_KEY}`;

// ─── Types ───────────────────────────────────────────────────────────────────

export type CalendarParticipant = {
  uid: string;
  name: string;
  role: string; // 'supervisor' | 'admin' | 'member' | 'non-member'
};

export type CalendarEvent = {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end:   { dateTime: string; timeZone?: string };
  colorId?: string;
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
};

export type SessionRequestData = {
  requestedTime: string;  // ISO start time
  requestedEnd:  string;  // ISO end time
  description?:  string;
};

export type CalendarUser = {
  uid: string;
  name: string;
  email: string;
  isSupervisor: boolean;
  isAdmin: boolean;
  membershipStatus: string;
};

// ─── Firestore helpers (for sessionRequests collection) ──────────────────────

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

// ─── Calendar auth headers ────────────────────────────────────────────────────

function authHeaders(accessToken: string) {
  return {
    Authorization:  `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    .map(p =>
      p.role === 'supervisor' || p.role === 'admin'
        ? `${p.name} (sup)`
        : p.name,
    )
    .join(' + ');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * List upcoming calendar events.
 * No permission check — all users can view.
 */
export async function listUpcomingEvents(
  accessToken: string,
  days = 14,
): Promise<CalendarEvent[]> {
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const url = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`
    + `?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;

  const res = await fetch(url, { headers: authHeaders(accessToken) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Calendar API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.items ?? [];
}

/**
 * Create a supervisor-tagged session on the calendar.
 * Requires: creatorUser.isSupervisor || creatorUser.isAdmin
 */
export async function createSupervisorEvent(
  accessToken: string,
  eventData: { start: string; end: string; description?: string; timeZone?: string },
  creatorUser: CalendarUser,
): Promise<CalendarEvent> {
  if (!creatorUser.isSupervisor && !creatorUser.isAdmin) {
    throw new Error('Only supervisors and admins can create supervisor events.');
  }

  const participant: CalendarParticipant = {
    uid:  creatorUser.uid,
    name: creatorUser.name,
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

  const url = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create event ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Join an existing supervisor session.
 * Callable by ANY authenticated user — adds them to the participants list,
 * rebuilds the title, then replaces the event (delete + create).
 *
 * Returns the new event ID.
 *
 * Note: write access to the KBC calendar is required. If the joiningUser does
 * not have write access via their token, this will throw a 403. In that case
 * the join should be recorded in Firestore only via createMemberRequest.
 */
export async function joinSession(
  accessToken: string,
  existingEventId: string,
  joiningUser: CalendarUser,
): Promise<string> {
  // 1. Fetch existing event
  const fetchUrl = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${existingEventId}`;
  const fetchRes = await fetch(fetchUrl, { headers: authHeaders(accessToken) });
  if (!fetchRes.ok) throw new Error(`Failed to fetch event ${fetchRes.status}`);
  const existing: CalendarEvent = await fetchRes.json();

  // 2. Parse and update participants
  const participants = parseParticipants(existing);

  // Idempotent — don't add twice
  if (participants.some(p => p.uid === joiningUser.uid)) {
    return existingEventId;
  }

  const newParticipant: CalendarParticipant = {
    uid:  joiningUser.uid,
    name: joiningUser.name,
    role: joiningUser.isAdmin ? 'admin'
        : joiningUser.isSupervisor ? 'supervisor'
        : joiningUser.membershipStatus === 'active' || joiningUser.membershipStatus === 'inactive' || joiningUser.membershipStatus === 'pending' ? 'member'
        : 'non-member',
  };
  const updatedParticipants = [...participants, newParticipant];
  const updatedTitle = buildTitle(updatedParticipants);

  // 3. Delete old event
  const deleteUrl = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${existingEventId}`;
  const deleteRes = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  if (!deleteRes.ok && deleteRes.status !== 204) {
    throw new Error(`Failed to delete old event ${deleteRes.status}`);
  }

  // 4. Create new event with updated title + participants
  const tz = existing.start.timeZone ?? 'America/Toronto';
  const newBody = {
    summary:     updatedTitle,
    description: existing.description,
    start: { dateTime: existing.start.dateTime, timeZone: tz },
    end:   { dateTime: existing.end.dateTime,   timeZone: tz },
    extendedProperties: {
      private: {
        ...(existing.extendedProperties?.private ?? {}),
        participants: JSON.stringify(updatedParticipants),
      },
    },
  };
  const createUrl = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(newBody),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Failed to create updated event ${createRes.status}: ${text}`);
  }
  const created: CalendarEvent = await createRes.json();
  return created.id;
}

/**
 * Delete a supervisor session.
 * Requires: requestingUser.isSupervisor || requestingUser.isAdmin
 */
export async function deleteSupervisorEvent(
  accessToken: string,
  eventId: string,
  requestingUser: CalendarUser,
): Promise<void> {
  if (!requestingUser.isSupervisor && !requestingUser.isAdmin) {
    throw new Error('Only supervisors and admins can delete supervisor events.');
  }
  const url = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${eventId}`;
  const res = await fetch(url, { method: 'DELETE', headers: authHeaders(accessToken) });
  if (!res.ok && res.status !== 204) throw new Error(`Failed to delete event: ${res.status}`);
}

/**
 * Submit a session request — writes to Firestore `sessionRequests` collection.
 * Does NOT write to Google Calendar.
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
