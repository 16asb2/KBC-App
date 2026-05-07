const CALENDAR_ID = process.env.EXPO_PUBLIC_GOOGLE_CALENDAR_ID!;
const BASE_URL = 'https://www.googleapis.com/calendar/v3';

export type CalendarEvent = {
  id: string;
  summary: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  description?: string;
  colorId?: string;
};

function authHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchEvents(accessToken: string, days = 14): Promise<CalendarEvent[]> {
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const url = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;
  const res = await fetch(url, { headers: authHeaders(accessToken) });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Calendar API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.items ?? [];
}

export async function createEvent(accessToken: string, event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> {
  const url = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to create event ${res.status}: ${body}`);
  }
  return res.json();
}

export async function updateEvent(accessToken: string, eventId: string, event: Partial<CalendarEvent>): Promise<CalendarEvent> {
  const url = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${eventId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(event),
  });

  if (!res.ok) throw new Error(`Failed to update event: ${res.status}`);
  return res.json();
}

export async function deleteEvent(accessToken: string, eventId: string): Promise<void> {
  const url = `${BASE_URL}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${eventId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });

  if (!res.ok) throw new Error(`Failed to delete event: ${res.status}`);
}
