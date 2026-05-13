import { generateId } from '@/utils/id';
import { getFirebaseToken } from '@/services/authBridge';

const PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!;
const API_KEY    = process.env.EXPO_PUBLIC_FIREBASE_API_KEY!;
const BASE       = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export const LOCATIONS = [
  'Cave Right', 'Cave Middle', 'Cave Left',
  'Green Wall', 'Blue Wall', 'Yellow Wall',
] as const;
export type Location = typeof LOCATIONS[number];

export const GRADES       = ['White', 'Blue', 'Purple', 'Pink', 'Black'] as const;
export const GRADE_COLORS = ['#e8e8e8', '#00b4d8', '#9b5de5', '#c0005a', '#1a1a1a'];
export const GRADE_TEXT   = ['#555',    '#fff',     '#fff',    '#fff',   '#fff'  ];
export type Grade = typeof GRADES[number];

export const BADGE_GROUPS = [
  {
    title: 'Hold Types',
    badges: ['Jugs', 'Crimps', 'Slopers', 'Pinches', 'Pockets', 'Underclings', 'Side Pulls', 'Gaston', 'Crack', 'Small-feet', 'Slippery-feet'],
  },
  {
    title: 'Climbing Technique',
    badges: ['Balancing', 'Drop Knee', 'Flagging', 'Heel Hook', 'Toe Hook', 'Bicycle', 'Deadpoint', 'Compression', 'Dyno', 'Double Dyno', 'Campus', 'Bat Hang', 'Hand-Jam', 'Finger-Jam', 'Foot-Jam'],
  },
  {
    title: 'Body Dependent',
    badges: ['Flexibility', 'Reachy', 'Shouldery', 'Body Tension', 'Contortionism', 'Small-fit'],
  },
  {
    title: 'Others',
    badges: ['Joy', 'Peaceful', 'Pain', 'Cry', 'Anger', 'Ego-Breaker', 'Joke', 'Outrageous', 'OMG', 'Love it', 'Hate it', 'Suffer'],
  },
] as const;

export const BADGES: readonly string[] = BADGE_GROUPS.flatMap(g => [...g.badges]);
export type Badge = typeof BADGES[number];

export type BoulderSeason = {
  id: string;
  name: string;
  createdAt: string;
};

export type Boulder = {
  id:          string;
  internalId:  string;   // stable cross-db reference; used in climbLogs.problemInternalId
  local:       string;   // always 'KBC'
  area:        string;   // always 'Boulders'
  permissions: { view: 'members'; edit: 'admin' };
  seasonId:    string;
  number:      number;
  name:        string;
  setter:      string;
  setterEmail: string;
  createdAt:   string;
  updatedAt:   string;
  locations:   string[];  // wall sections (Cave Right, etc.)
  photo:       string;
  removed:     boolean;
};

export type BoulderComment = {
  id: string;
  uid: string;
  name: string;
  text: string;
  createdAt: string;
};

export function avgGrade(votes: Record<string, number>): number | null {
  const vals = Object.values(votes);
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

export function avgQuality(votes: Record<string, number>): number | null {
  const vals = Object.values(votes);
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

// ─── Firestore encode / decode ────────────────────────────────────────────────

function encodeVal(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number')  return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === 'string')  return { stringValue: val };
  if (Array.isArray(val))       return { arrayValue: { values: val.map(encodeVal) } };
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) fields[k] = encodeVal(v);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function decodeVal(fval: any): any {
  if (!fval) return null;
  if ('stringValue'    in fval) return fval.stringValue;
  if ('booleanValue'   in fval) return fval.booleanValue;
  if ('integerValue'   in fval) return parseInt(fval.integerValue, 10);
  if ('doubleValue'    in fval) return fval.doubleValue;
  if ('timestampValue' in fval) return fval.timestampValue;
  if ('nullValue'      in fval) return null;
  if ('arrayValue'     in fval) return (fval.arrayValue.values ?? []).map(decodeVal);
  if ('mapValue'       in fval) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(fval.mapValue.fields ?? {})) out[k] = decodeVal(v);
    return out;
  }
  return null;
}

function encodeDoc(data: Record<string, any>) {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) fields[k] = encodeVal(v);
  return { fields };
}

function decodeDoc(doc: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(doc.fields ?? {})) out[k] = decodeVal(v as any);
  return out;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function firebaseAuthHeader(): Promise<Record<string, string>> {
  const token = await getFirebaseToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fsPatch(path: string, data: Record<string, any>, mask?: string[]) {
  let url = `${BASE}/${path}?key=${API_KEY}`;
  if (mask) url += mask.map(f => `&updateMask.fieldPaths=${encodeURIComponent(f)}`).join('');
  const authH = await firebaseAuthHeader();
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authH },
    body: JSON.stringify(encodeDoc(data)),
  });
  if (!res.ok) throw new Error(`Firestore PATCH ${res.status}`);
  return res.json();
}

async function fsPost(col: string, data: Record<string, any>) {
  const authH = await firebaseAuthHeader();
  const res = await fetch(`${BASE}/${col}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authH },
    body: JSON.stringify(encodeDoc(data)),
  });
  if (!res.ok) throw new Error(`Firestore POST ${res.status}`);
  return res.json();
}

async function fsList(col: string): Promise<any[]> {
  const authH = await firebaseAuthHeader();
  const res = await fetch(`${BASE}/${col}?key=${API_KEY}&pageSize=500`, { headers: authH });
  if (!res.ok) throw new Error(`Firestore LIST ${res.status}`);
  const json = await res.json();
  return json.documents ?? [];
}

async function fsDelete(path: string) {
  const authH = await firebaseAuthHeader();
  const res = await fetch(`${BASE}/${path}?key=${API_KEY}`, { method: 'DELETE', headers: authH });
  if (!res.ok && res.status !== 404) throw new Error(`Firestore DELETE ${res.status}`);
}

// ─── Seasons ──────────────────────────────────────────────────────────────────

function docToSeason(doc: any): BoulderSeason {
  const id = doc.name.split('/').pop() as string;
  const d  = decodeDoc(doc);
  return { id, name: d.name ?? '', createdAt: d.createdAt ?? '' };
}

export async function getSeasons(): Promise<BoulderSeason[]> {
  const docs = await fsList('boulderSeasons');
  return docs.map(docToSeason).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createSeason(name: string): Promise<BoulderSeason> {
  const doc = await fsPost('boulderSeasons', { name, createdAt: new Date().toISOString() });
  return docToSeason(doc);
}

// ─── Boulders ─────────────────────────────────────────────────────────────────

function docToBoulder(doc: any): Boulder {
  const id = doc.name.split('/').pop() as string;
  const d  = decodeDoc(doc);
  return {
    id,
    internalId:  d.internalId  ?? id,   // fall back to doc ID for old documents
    local:       d.local       ?? 'KBC',
    area:        d.area        ?? 'Boulders',
    permissions: d.permissions ?? { view: 'members', edit: 'admin' },
    seasonId:    d.seasonId    ?? '',
    number:      d.number      ?? 0,
    name:        d.name        ?? '',
    setter:      d.setter      ?? '',
    setterEmail: d.setterEmail ?? '',
    createdAt:   d.createdAt   ?? '',
    updatedAt:   d.updatedAt   ?? '',
    locations:   Array.isArray(d.locations) ? d.locations : [],
    photo:       d.photo       ?? '',
    removed:     d.removed     ?? false,
  };
}

export async function getBouldersForSeason(seasonId: string): Promise<Boulder[]> {
  const docs = await fsList('boulders');
  return docs
    .map(docToBoulder)
    .filter(b => b.seasonId === seasonId && !b.removed)
    .sort((a, b) => a.number - b.number);
}

export async function getNextBoulderNumber(seasonId: string): Promise<number> {
  const docs = await fsList('boulders');
  const nums = docs.map(docToBoulder).filter(b => b.seasonId === seasonId).map(b => b.number);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

export async function createBoulder(data: Omit<Boulder, 'id' | 'internalId' | 'local' | 'area' | 'permissions'>): Promise<Boulder> {
  const full = {
    ...data,
    internalId:  generateId(),
    local:       'KBC',
    area:        'Boulders',
    permissions: { view: 'members', edit: 'admin' },
  };
  const doc = await fsPost('boulders', full);
  return docToBoulder(doc);
}

export async function updateBoulder(id: string, updates: Partial<Omit<Boulder, 'id'>>): Promise<void> {
  const data = { ...updates, updatedAt: new Date().toISOString() };
  await fsPatch(`boulders/${id}`, data, Object.keys(data));
}

export async function removeBoulder(id: string): Promise<void> {
  await fsPatch(`boulders/${id}`,
    { removed: true, updatedAt: new Date().toISOString() },
    ['removed', 'updatedAt'],
  );
}

// ─── Comments ─────────────────────────────────────────────────────────────────

function docToComment(doc: any): BoulderComment {
  const id = doc.name.split('/').pop() as string;
  const d  = decodeDoc(doc);
  return {
    id,
    uid:       d.uid       ?? '',
    name:      d.name      ?? '',
    text:      d.text      ?? '',
    createdAt: d.createdAt ?? '',
  };
}

export async function getComments(boulderId: string): Promise<BoulderComment[]> {
  const docs = await fsList(`boulders/${boulderId}/comments`);
  return docs
    .map(docToComment)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addComment(
  boulderId: string,
  data: Omit<BoulderComment, 'id'>,
): Promise<BoulderComment> {
  const doc = await fsPost(`boulders/${boulderId}/comments`, data);
  return docToComment(doc);
}

export async function deleteComment(boulderId: string, commentId: string): Promise<void> {
  await fsDelete(`boulders/${boulderId}/comments/${commentId}`);
}

// ─── One-time migration ───────────────────────────────────────────────────────

/**
 * Backfills internalId, local, area, permissions on existing boulder documents.
 * Call once manually after deploying the schema change. Safe to re-run.
 */
export async function migrateBouldersAddFields(): Promise<void> {
  const docs = await fsList('boulders');
  const mask = ['internalId', 'local', 'area', 'permissions'];
  await Promise.all(docs.map(async (doc: any) => {
    const d  = decodeDoc(doc);
    const id = (doc.name as string).split('/').pop() as string;
    if (d.internalId) return; // already migrated
    await fsPatch(`boulders/${id}`, {
      internalId:  generateId(),
      local:       'KBC',
      area:        'Boulders',
      permissions: { view: 'members', edit: 'admin' },
    }, mask);
  }));
}
