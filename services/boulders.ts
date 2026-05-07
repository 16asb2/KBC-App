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
    badges: ['Jugs', 'Crimps', 'Slopers', 'Pinches', 'Pockets', 'Underclings', 'Side Pulls', 'Gaston', 'Small-feet', 'Slippery-feet', 'No-feet'],
  },
  {
    title: 'Climbing Technique',
    badges: ['Balancing', 'Drop Knee', 'Flagging', 'Heel Hook', 'Toe Hook', 'Bicycle', 'Deadpoint', 'Compression', 'Dyno', 'Double Dyno', 'Campus', 'Bat Hang'],
  },
  {
    title: 'Body Dependent',
    badges: ['Flexibility', 'Reachy', 'Shouldery', 'Body Tension', 'Contortionism', 'Small-fit'],
  },
  {
    title: 'Others',
    badges: ['Joy', 'Peaceful', 'Pain', 'Cry', 'Anger', 'Ego-Breaker', 'Joke', 'Outrageous', 'One-try', 'Last-try', 'OMG'],
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
  id: string;
  seasonId: string;
  number: number;
  name: string;
  setter: string;
  setterEmail: string;
  createdAt: string;
  updatedAt: string;
  locations: string[];
  gradeVotes: Record<string, number>;    // uid → 0.0–4.0
  qualityVotes: Record<string, number>;  // uid → 1–3 stars
  photo: string;
  badgeVotes: Record<string, string[]>;  // badge → uid[]
  ascentCount: number;
  attemptCount: number;
  removed: boolean;
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

async function fsPatch(path: string, data: Record<string, any>, mask?: string[]) {
  let url = `${BASE}/${path}?key=${API_KEY}`;
  if (mask) url += mask.map(f => `&updateMask.fieldPaths=${encodeURIComponent(f)}`).join('');
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encodeDoc(data)),
  });
  if (!res.ok) throw new Error(`Firestore PATCH ${res.status}`);
  return res.json();
}

async function fsPost(col: string, data: Record<string, any>) {
  const res = await fetch(`${BASE}/${col}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encodeDoc(data)),
  });
  if (!res.ok) throw new Error(`Firestore POST ${res.status}`);
  return res.json();
}

async function fsList(col: string): Promise<any[]> {
  const res = await fetch(`${BASE}/${col}?key=${API_KEY}&pageSize=500`);
  if (!res.ok) throw new Error(`Firestore LIST ${res.status}`);
  const json = await res.json();
  return json.documents ?? [];
}

async function fsDelete(path: string) {
  const res = await fetch(`${BASE}/${path}?key=${API_KEY}`, { method: 'DELETE' });
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
  const isObj = (v: any) => v && typeof v === 'object' && !Array.isArray(v);
  return {
    id,
    seasonId:     d.seasonId     ?? '',
    number:       d.number       ?? 0,
    name:         d.name         ?? '',
    setter:       d.setter       ?? '',
    setterEmail:  d.setterEmail  ?? '',
    createdAt:    d.createdAt    ?? '',
    updatedAt:    d.updatedAt    ?? '',
    locations:    Array.isArray(d.locations) ? d.locations : [],
    gradeVotes:   isObj(d.gradeVotes)   ? d.gradeVotes   : {},
    qualityVotes: isObj(d.qualityVotes) ? d.qualityVotes : {},
    photo:        d.photo        ?? '',
    badgeVotes:   isObj(d.badgeVotes)   ? d.badgeVotes   : {},
    ascentCount:  typeof d.ascentCount  === 'number' ? d.ascentCount  : 0,
    attemptCount: typeof d.attemptCount === 'number' ? d.attemptCount : 0,
    removed:      d.removed      ?? false,
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

export async function createBoulder(data: Omit<Boulder, 'id'>): Promise<Boulder> {
  const doc = await fsPost('boulders', data);
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

// ─── Logs (ascents / attempts) ────────────────────────────────────────────────

export type BoulderLog = {
  id: string;
  boulderId: string;
  uid: string;
  name: string;
  type: 'ascent' | 'attempt';
  date: string;                   // ISO — when the climb happened
  proposedGrade: number | null;   // 0.0–4.0, null = no opinion
  quality: number;                // 0 = no vote, 1–3 stars
  effort: string;                 // '' | 'Easy' | 'Medium' | 'Hard' | 'Impossible'
  project: boolean;
  publicComment: string;
  privateComment: string;
  createdAt: string;
};

function docToLog(doc: any): BoulderLog {
  const id    = doc.name.split('/').pop() as string;
  const d     = decodeDoc(doc);
  const parts = (doc.name as string).split('/');
  const boulderId = parts[parts.length - 3] ?? '';
  return {
    id,
    boulderId,
    uid:           d.uid           ?? '',
    name:          d.name          ?? '',
    type:          d.type          ?? 'attempt',
    date:          d.date          ?? d.createdAt ?? '',
    proposedGrade: typeof d.proposedGrade === 'number' ? d.proposedGrade : null,
    quality:       typeof d.quality === 'number' ? d.quality : 0,
    effort:        d.effort        ?? '',
    project:       d.project       ?? false,
    publicComment: d.publicComment ?? '',
    privateComment:d.privateComment ?? '',
    createdAt:     d.createdAt     ?? '',
  };
}

export async function addBoulderLog(
  boulderId: string,
  entry: Omit<BoulderLog, 'id' | 'boulderId'>,
): Promise<BoulderLog> {
  const doc = await fsPost(`boulders/${boulderId}/logs`, { ...entry, boulderId });
  return docToLog(doc);
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
