import { fetchWithAuth } from '@/services/authBridge';

const PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!;
const API_KEY    = process.env.EXPO_PUBLIC_FIREBASE_API_KEY!;
const BASE       = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const QUERY_URL  = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;

// ─── Firestore REST helpers ──────────────────────────────────────────────────

type FVal = Record<string, any>;

function encode(val: any): FVal {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number')  return { integerValue: String(val) };
  if (typeof val === 'string')  return { stringValue: val };
  return { nullValue: null };
}

function decode(fval: FVal): any {
  if ('stringValue'    in fval) return fval.stringValue;
  if ('booleanValue'   in fval) return fval.booleanValue;
  if ('integerValue'   in fval) return parseInt(fval.integerValue, 10);
  if ('timestampValue' in fval) return fval.timestampValue;
  return null;
}

function encodeDoc(data: Record<string, any>) {
  const fields: Record<string, FVal> = {};
  for (const [k, v] of Object.entries(data)) fields[k] = encode(v);
  return { fields };
}

function decodeDoc(doc: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(doc.fields ?? {})) out[k] = decode(v as FVal);
  return out;
}

async function fsPatch(path: string, data: Record<string, any>, mask?: string[]) {
  let url = `${BASE}/${path}?key=${API_KEY}`;
  if (mask) url += mask.map(f => `&updateMask.fieldPaths=${encodeURIComponent(f)}`).join('');
  const res = await fetchWithAuth(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encodeDoc(data)),
  });
  if (!res.ok) throw new Error(`Firestore PATCH ${res.status}`);
}

async function fsQuery(query: any): Promise<any[]> {
  const res = await fetchWithAuth(QUERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: query }),
  });
  if (!res.ok) throw new Error(`Firestore query ${res.status}`);
  const results = await res.json();
  return results.filter((r: any) => r.document);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type LogEntry = {
  id: string;
  timestamp: string;   // ISO
  userId: string;
  userName: string;
  accessType: string;  // e.g. "Active Member", "Drop-In", "Punch Pass (4 left)"
  notes?: string;
  amendedBy?: string;
  amendedAt?: string;
};

export type AccessOption = {
  id: string;
  label: string;
  price: string;
  detail?: string;
  months?: number;   // if membership
  punches?: number;  // if punch pass
};

export const ACCESS_OPTIONS: AccessOption[] = [
  { id: 'dropin',      label: 'Drop-In',                price: '$20'  },
  { id: 'punch10',     label: '10× Punch Passes',        price: '$160', punches: 10 },
  { id: 'mem1m',       label: '1-month pass',            price: '$55',           months: 1  },
  { id: 'mem4m',       label: '4-months pass',           price: '$200 ($50/m)',   months: 4  },
  { id: 'mem8m',       label: '8-months pass',           price: '$350 ($44/m)',   months: 8  },
  { id: 'mem12m',      label: 'Annual Pass',             price: '$450 ($38/m)',   months: 12 },
  { id: 'student12m',  label: 'Student annual pass',     price: '$350 ($44/m)',   months: 12 },
];

// ─── Public API ──────────────────────────────────────────────────────────────

function makeId(timestamp: string): string {
  const base = timestamp.replace(/[:.]/g, '-').slice(0, 23);
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function addLogEntry(entry: Omit<LogEntry, 'id'>): Promise<void> {
  const id = makeId(entry.timestamp);
  await fsPatch(`logs/${id}`, entry);
}

export async function getRecentLogs(): Promise<LogEntry[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  // No orderBy — range filter + orderBy on the same field can still require an explicit
  // descending index in Firestore REST. Sort client-side instead (matches project convention).
  const docs = await fsQuery({
    from: [{ collectionId: 'logs' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'timestamp' },
        op: 'GREATER_THAN_OR_EQUAL',
        value: { stringValue: since.toISOString() },
      },
    },
    limit: 500,
  });
  return docs
    .map(r => ({ id: r.document.name.split('/').pop(), ...decodeDoc(r.document) } as LogEntry))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function getArchiveLogs(): Promise<LogEntry[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const docs = await fsQuery({
    from: [{ collectionId: 'logs' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'timestamp' },
        op: 'LESS_THAN',
        value: { stringValue: cutoff.toISOString() },
      },
    },
    limit: 300,
  });
  return docs
    .map(r => ({ id: r.document.name.split('/').pop(), ...decodeDoc(r.document) } as LogEntry))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function getUserLogs(uid: string): Promise<LogEntry[]> {
  // No orderBy here — combining an equality filter on userId with orderBy timestamp
  // would require a composite Firestore index. Sort client-side instead.
  const docs = await fsQuery({
    from: [{ collectionId: 'logs' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'userId' },
        op: 'EQUAL',
        value: { stringValue: uid },
      },
    },
    limit: 100,
  });
  return docs
    .map(r => ({ id: r.document.name.split('/').pop(), ...decodeDoc(r.document) } as LogEntry))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // ISO strings sort correctly
}

export async function getActiveClimberCount(): Promise<number> {
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2-hour window
  const docs = await fsQuery({
    from: [{ collectionId: 'logs' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'timestamp' },
        op: 'GREATER_THAN_OR_EQUAL',
        value: { stringValue: since.toISOString() },
      },
    },
    limit: 200,
  });
  const entries = docs.map(r => decodeDoc(r.document));
  const uids = new Set(entries.map((e: any) => e.userId).filter(Boolean));
  return uids.size;
}

export async function updateLogEntry(
  id: string,
  updates: Partial<Pick<LogEntry, 'accessType' | 'notes'>>,
  byEmail: string,
): Promise<void> {
  const data = { ...updates, amendedBy: byEmail, amendedAt: new Date().toISOString() };
  await fsPatch(`logs/${id}`, data, Object.keys(data));
}

export async function deleteLogEntry(id: string): Promise<void> {
  const res = await fetchWithAuth(`${BASE}/logs/${id}?key=${API_KEY}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Firestore DELETE ${res.status}`);
}

// ─── Gym Open Status ─────────────────────────────────────────────────────────
// Stored in `gymStatus/current` — updated whenever a supervisor signs in.
// closesAt = 2 hours after the supervisor's sign-in timestamp.

export type GymStatus = {
  open: boolean;
  openedBy?: string;   // display name of the supervisor who signed in
  openedAt?: string;   // ISO timestamp of sign-in
  closesAt?: string;   // ISO timestamp when the "open" indication expires
};

async function fsGet(path: string): Promise<any | null> {
  const res = await fetchWithAuth(`${BASE}/${path}?key=${API_KEY}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET ${res.status}`);
  return res.json();
}

export async function getGymStatus(): Promise<GymStatus> {
  try {
    const doc = await fsGet('gymStatus/current');
    if (!doc?.fields) return { open: false };
    const d = decodeDoc(doc);
    const closesAt = d.closesAt as string | undefined;
    // Mark as closed if closesAt is in the past
    const open = !!closesAt && new Date(closesAt) > new Date();
    return { open, openedBy: d.openedBy, openedAt: d.openedAt, closesAt };
  } catch {
    return { open: false };
  }
}

export async function setGymOpen(openedBy: string): Promise<void> {
  const openedAt = new Date().toISOString();
  const closesAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  await fsPatch('gymStatus/current', { openedBy, openedAt, closesAt });
}
