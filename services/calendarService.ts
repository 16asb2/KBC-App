// Architecture: all Google Calendar WRITE operations (create, update, delete) use the
// KBC super-admin account token obtained via services/adminToken.ts.
// No individual user OAuth token is required for writes — this means no per-user
// calendar sharing is needed and all event changes appear under the admin account.
//
// READ operations (listUpcomingEvents) still use the signed-in user's token, which
// works because the KBC calendar is shared as read-only with all Google users.

import { getAdminCalendarToken } from '@/services/adminToken';
import { getFirebaseToken } from '@/services/authBridge';

const CALENDAR_ID = process.env.EXPO_PUBLIC_GOOGLE_CALENDAR_ID!;
const BASE_URL    = 'https://www.googleapis.com/calendar/v3';

const PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!;
const API_KEY    = process.env.EXPO_PUBLIC_FIREBASE_API_KEY!;
const FS_BASE    = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ─── Types ───────────────────────────────────────────────────────────────────

export type CalendarParticipant = {
  uid:  string;
  name: string;
  role: string; // 'supervisor' | 'admin' | 'member'
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
  const fbToken = await getFirebaseToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (fbToken) headers.Authorization = `Bearer ${fbToken}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers,
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
 * Format: "Artur (super) + Garry + Andy"
 * Supervisors and admins get "(super)" suffix; others get no label.
 */
function buildTitle(participants: CalendarParticipant[]): string {
  return participants
    .map(p => (p.role === 'supervisor' || p.role === 'admin') ? `${p.name} (super)` : p.name)
    .join(' + ');
}

/**
 * Reconstruct a participants list from a legacy event title that predates extendedProperties tracking.
 * Handles both "(sup)" and "(super)" suffixes.
 * Synthetic UIDs are assigned so these entries can be identified later.
 */
function reconstructParticipantsFromTitle(summary: string): CalendarParticipant[] {
  return summary.split(' + ').map((part, i) => {
    const trimmed = part.trim();
    const isSup   = /\(sup(er)?\)$/i.test(trimmed);
    const name    = trimmed.replace(/\s*\(sup(er)?\)$/i, '').trim();
    return {
      uid:  `legacy_${i}_${name.toLowerCase().replace(/\s+/g, '_')}`,
      name,
      role: isSup ? 'supervisor' : ('member' as CalendarParticipant['role']),
    };
  });
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function isSupervisorEventSummary(summary: string | undefined): boolean {
  const s = summary?.toLowerCase() ?? '';
  return s.includes('(sup)') || s.includes('(super)');
}

function isRequestedEventSummary(summary: string | undefined): boolean {
  return summary?.toLowerCase().includes('(requested)') ?? false;
}

async function listEventsInRangeAdmin(
  timeMin: string,
  timeMax: string,
  adminToken: string,
): Promise<CalendarEvent[]> {
  const url = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`
    + `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
  const res = await fetch(url, { headers: authHeaders(adminToken) });
  if (!res.ok) throw new Error(`Calendar list error ${res.status}`);
  const data = await res.json();
  return data.items ?? [];
}

async function patchEventTimes(
  eventId: string,
  start: string,
  end: string,
  timeZone: string,
  adminToken: string,
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${eventId}`,
    {
      method: 'PATCH',
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        start: { dateTime: start, timeZone },
        end:   { dateTime: end,   timeZone },
      }),
    },
  );
  if (!res.ok) throw new Error(`Patch event times failed: ${res.status}`);
}

async function deleteEventAdmin(eventId: string, adminToken: string): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${eventId}`,
    { method: 'DELETE', headers: authHeaders(adminToken) },
  );
  if (!res.ok && res.status !== 204) throw new Error(`Delete event failed: ${res.status}`);
}

async function createRawRequest(
  name: string,
  email: string,
  start: string,
  end: string,
  timeZone: string,
  adminToken: string,
): Promise<void> {
  const body = {
    summary:     `${name} (requested)`,
    description: `requested_by:${email}`,
    start: { dateTime: start, timeZone },
    end:   { dateTime: end,   timeZone },
  };
  const res = await fetch(
    `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
    { method: 'POST', headers: authHeaders(adminToken), body: JSON.stringify(body) },
  );
  if (!res.ok) throw new Error(`Create trimmed request failed: ${res.status}`);
}

/** Subtract supervisor slot intervals from a request interval, returning non-overlapping parts. */
function subtractIntervals(
  start: Date,
  end: Date,
  toSubtract: { start: Date; end: Date }[],
): { start: Date; end: Date }[] {
  const sorted = [...toSubtract].sort((a, b) => a.start.getTime() - b.start.getTime());
  let remaining = [{ start, end }];
  for (const sub of sorted) {
    const next: { start: Date; end: Date }[] = [];
    for (const interval of remaining) {
      if (sub.end <= interval.start || sub.start >= interval.end) {
        next.push(interval);
      } else {
        if (interval.start < sub.start) next.push({ start: interval.start, end: sub.start });
        if (interval.end > sub.end)     next.push({ start: sub.end,        end: interval.end });
      }
    }
    remaining = next;
  }
  return remaining;
}

/**
 * After a supervisor slot is created or fulfilled, trim/delete any requests that overlap it.
 * - Fully contained requests are deleted.
 * - Partially overlapping requests are trimmed to the non-overlapping portion.
 * - Requests spanning the entire slot are split into two.
 */
async function reconcileRequestsWithSupervisorSlot(
  supStart: Date,
  supEnd: Date,
  timeZone: string,
  adminToken: string,
): Promise<void> {
  const buffer = 60 * 60 * 1000;
  const events = await listEventsInRangeAdmin(
    new Date(supStart.getTime() - buffer).toISOString(),
    new Date(supEnd.getTime() + buffer).toISOString(),
    adminToken,
  );

  const requests = events.filter(
    e => isRequestedEventSummary(e.summary) && e.start.dateTime && e.end.dateTime,
  );

  for (const req of requests) {
    const reqStart = new Date(req.start.dateTime!);
    const reqEnd   = new Date(req.end.dateTime!);

    if (reqEnd <= supStart || reqStart >= supEnd) continue; // no overlap

    const reqName  = req.summary?.replace(/\s*\(requested\)/i, '').trim() ?? '';
    const reqEmail = req.description?.match(/^requested_by:(.+)$/)?.[1].trim() ?? '';
    const tz       = req.start.timeZone ?? timeZone;

    if (reqStart >= supStart && reqEnd <= supEnd) {
      // Fully contained: delete
      await deleteEventAdmin(req.id, adminToken);
    } else if (reqStart < supStart && reqEnd > supEnd) {
      // Spans entire slot: delete and recreate two trimmed requests
      await deleteEventAdmin(req.id, adminToken);
      await createRawRequest(reqName, reqEmail, req.start.dateTime!, supStart.toISOString(), tz, adminToken);
      await createRawRequest(reqName, reqEmail, supEnd.toISOString(), req.end.dateTime!, tz, adminToken);
    } else if (reqStart < supStart) {
      // Overlaps at end: trim end to supervisor start
      await patchEventTimes(req.id, req.start.dateTime!, supStart.toISOString(), tz, adminToken);
    } else {
      // Overlaps at start: trim start to supervisor end
      await patchEventTimes(req.id, supEnd.toISOString(), req.end.dateTime!, tz, adminToken);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * List upcoming calendar events.
 * Uses the signed-in user's access token — no admin token needed for reads.
 */
export async function listUpcomingEvents(
  accessToken: string,
  days = 14,
  pastDays = 0,
): Promise<CalendarEvent[]> {
  const timeMin = new Date(Date.now() - pastDays * 24 * 60 * 60 * 1000).toISOString();
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
  const created: CalendarEvent = await res.json();

  // Trim/delete any requests that overlap with this new supervisor slot
  try {
    await reconcileRequestsWithSupervisorSlot(new Date(eventData.start), new Date(eventData.end), tz, adminToken);
  } catch {
    // Reconciliation is best-effort; the supervisor slot was still created
  }

  return created;
}

/**
 * Create a member-requested session on the KBC calendar.
 * Pre-checks for overlapping supervisor slots and only creates requests for uncovered intervals.
 * May create multiple events if supervisor slots split the requested time.
 * Throws if the entire requested time is already covered by a supervisor session.
 */
export async function createSessionRequest(
  eventData: { start: string; end: string; timeZone?: string; nameOverride?: string },
  requesterUser: CalendarUser,
): Promise<CalendarEvent[]> {
  const adminToken  = await getAdminCalendarToken();
  const tz          = eventData.timeZone ?? 'America/Toronto';
  const reqStart    = new Date(eventData.start);
  const reqEnd      = new Date(eventData.end);

  // Fetch nearby events to find supervisor slots that overlap with this request
  const buffer = 30 * 60 * 1000;
  const nearby = await listEventsInRangeAdmin(
    new Date(reqStart.getTime() - buffer).toISOString(),
    new Date(reqEnd.getTime() + buffer).toISOString(),
    adminToken,
  );

  const supSlots = nearby
    .filter(e => isSupervisorEventSummary(e.summary) && e.start.dateTime && e.end.dateTime)
    .map(e => ({ start: new Date(e.start.dateTime!), end: new Date(e.end.dateTime!) }))
    .filter(s => s.end > reqStart && s.start < reqEnd);

  const intervals = subtractIntervals(reqStart, reqEnd, supSlots);

  if (intervals.length === 0) {
    throw new Error('A supervisor session already covers this time — no need to request one!');
  }

  const displayName = eventData.nameOverride ?? requesterUser.name;
  const created: CalendarEvent[] = [];

  for (const { start, end } of intervals) {
    const body: Omit<CalendarEvent, 'id'> = {
      summary:     `${displayName} (requested)`,
      description: `requested_by:${requesterUser.email}`,
      start: { dateTime: start.toISOString(), timeZone: tz },
      end:   { dateTime: end.toISOString(),   timeZone: tz },
    };
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
    created.push(await res.json());
  }

  return created;
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

  // Parse participants — fall back to reconstructing from title for legacy events
  let participants = parseParticipants(existing);
  if (participants.length === 0 && existing.summary) {
    participants = reconstructParticipantsFromTitle(existing.summary);
  }

  // Idempotent — don't add twice (match by UID or name)
  const joinerName = joiningUser.name.toLowerCase();
  if (participants.some(p => p.uid === joiningUser.uid || p.name.toLowerCase() === joinerName)) {
    return existingEventId;
  }

  const newParticipant: CalendarParticipant = {
    uid:  joiningUser.uid,
    name: joiningUser.name,
    role: joiningUser.isAdmin        ? 'admin'
        : joiningUser.isSupervisor   ? 'supervisor'
        : 'member',
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
 * Leave an existing supervisor session.
 * Removes the user from the participants list and rebuilds the title.
 * Uses the admin account for the calendar write.
 * Throws if the user is the only participant (would leave an empty session).
 */
export async function leaveSession(
  existingEventId: string,
  leavingUser: CalendarUser,
  userAccessToken: string,
): Promise<string> {
  const fetchUrl = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${existingEventId}`;
  const fetchRes = await fetch(fetchUrl, { headers: authHeaders(userAccessToken) });
  if (!fetchRes.ok) throw new Error(`Failed to fetch event ${fetchRes.status}`);
  const existing: CalendarEvent = await fetchRes.json();

  // Parse participants — fall back to reconstructing from title for legacy events
  let participants = parseParticipants(existing);
  if (participants.length === 0 && existing.summary) {
    participants = reconstructParticipantsFromTitle(existing.summary);
  }

  if (participants.length === 0) {
    throw new Error('Cannot leave this session — participant data is unavailable.');
  }

  const leaverName = leavingUser.name.toLowerCase();
  // Match by UID (tracked entries) or by name (legacy reconstructed entries)
  const updatedParticipants = participants.filter(
    p => p.uid !== leavingUser.uid && p.name.toLowerCase() !== leaverName,
  );

  if (updatedParticipants.length === participants.length) {
    // User wasn't found in participant list — nothing to remove
    return existingEventId;
  }

  if (updatedParticipants.length === 0) {
    throw new Error('You cannot leave a session with no other participants.');
  }

  const updatedTitle = buildTitle(updatedParticipants);

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
 * Fulfill a session request.
 * If the fulfilling supervisor has an existing slot exactly adjacent to the request time,
 * merges the request into that slot (extends it and adds the requester's name).
 * Otherwise deletes the request and creates a new supervisor session.
 * Also reconciles any other requests that overlap with the resulting slot.
 */
export async function fulfillSessionRequest(
  requestEventId: string,
  adjustedStart: string,
  adjustedEnd: string,
  requesterName: string,
  fulfillingUser: CalendarUser,
): Promise<void> {
  if (!fulfillingUser.isSupervisor && !fulfillingUser.isAdmin) {
    throw new Error('Only supervisors and admins can fulfill session requests.');
  }

  const adminToken = await getAdminCalendarToken();
  const tz         = 'America/Toronto';
  const newStart   = new Date(adjustedStart);
  const newEnd     = new Date(adjustedEnd);
  const buffer     = 60 * 60 * 1000;

  // Look for an adjacent supervisor slot where the fulfilling user is a participant
  const nearby = await listEventsInRangeAdmin(
    new Date(newStart.getTime() - buffer).toISOString(),
    new Date(newEnd.getTime() + buffer).toISOString(),
    adminToken,
  );

  const adjacent = nearby.find(e => {
    if (!isSupervisorEventSummary(e.summary) || !e.start.dateTime || !e.end.dateTime) return false;
    if (e.id === requestEventId) return false;
    const participants = parseParticipants(e);
    if (!participants.some(p => p.uid === fulfillingUser.uid)) return false;
    const evEnd   = new Date(e.end.dateTime);
    const evStart = new Date(e.start.dateTime);
    // Adjacent means touching but not overlapping
    return evEnd.getTime() === newStart.getTime() || evStart.getTime() === newEnd.getTime();
  });

  let finalStart = newStart;
  let finalEnd   = newEnd;

  if (adjacent) {
    // Merge: extend the adjacent slot to cover both and add the requester
    const adjStart    = new Date(adjacent.start.dateTime!);
    const adjEnd      = new Date(adjacent.end.dateTime!);
    const mergedStart = adjStart < newStart ? adjStart : newStart;
    const mergedEnd   = adjEnd   > newEnd   ? adjEnd   : newEnd;

    const participants = parseParticipants(adjacent);
    if (!participants.some(p => p.name === requesterName)) {
      participants.push({ uid: `req_${Date.now()}`, name: requesterName, role: 'member' });
    }

    const patchRes = await fetch(
      `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${adjacent.id}`,
      {
        method: 'PATCH',
        headers: authHeaders(adminToken),
        body: JSON.stringify({
          summary: buildTitle(participants),
          start:   { dateTime: mergedStart.toISOString(), timeZone: tz },
          end:     { dateTime: mergedEnd.toISOString(),   timeZone: tz },
          extendedProperties: {
            private: {
              ...(adjacent.extendedProperties?.private ?? {}),
              participants: JSON.stringify(participants),
            },
          },
        }),
      },
    );
    if (!patchRes.ok) {
      const text = await patchRes.text();
      throw new Error(`Failed to merge sessions: ${patchRes.status}: ${text}`);
    }

    await deleteEventAdmin(requestEventId, adminToken);
    finalStart = mergedStart;
    finalEnd   = mergedEnd;
  } else {
    // No adjacent slot: delete request and create a new supervisor session
    await deleteEventAdmin(requestEventId, adminToken);

    const supParticipant: CalendarParticipant = {
      uid:  fulfillingUser.uid,
      name: fulfillingUser.name,
      role: fulfillingUser.isAdmin ? 'admin' : 'supervisor',
    };
    const reqParticipant: CalendarParticipant = {
      uid:  `req_${Date.now()}`,
      name: requesterName,
      role: 'member',
    };
    const allParticipants = [supParticipant, reqParticipant];

    const body: Omit<CalendarEvent, 'id'> = {
      summary: buildTitle(allParticipants),
      start:   { dateTime: adjustedStart, timeZone: tz },
      end:     { dateTime: adjustedEnd,   timeZone: tz },
      extendedProperties: {
        private: {
          createdByRole:   fulfillingUser.isAdmin ? 'admin' : 'supervisor',
          createdByUserId: fulfillingUser.uid,
          participants:    JSON.stringify(allParticipants),
        },
      },
    };

    const url = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;
    const res = await fetch(url, {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to create fulfilled session: ${res.status}: ${text}`);
    }
  }

  // Reconcile any other requests that overlap with the resulting supervisor slot
  try {
    await reconcileRequestsWithSupervisorSlot(finalStart, finalEnd, tz, adminToken);
  } catch {
    // Non-fatal
  }
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
    body.summary = isSup ? `${name} (super)` : name;
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
 */
export async function createMemberRequest(
  requestData: SessionRequestData,
  requesterUser: CalendarUser,
): Promise<void> {
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
