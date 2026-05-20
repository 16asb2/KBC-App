import { getFirebaseToken } from '@/services/authBridge';

const PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!;
const API_KEY    = process.env.EXPO_PUBLIC_FIREBASE_API_KEY!;
const BASE       = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const QUERY_URL  = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;

// ─── Firestore REST helpers ───────────────────────────────────────────────────

async function firebaseAuthHeader(): Promise<Record<string, string>> {
  const token = await getFirebaseToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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

async function fsQuery(query: any): Promise<any[]> {
  const authH = await firebaseAuthHeader();
  const res = await fetch(QUERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authH },
    body: JSON.stringify({ structuredQuery: query }),
  });
  if (!res.ok) throw new Error(`Firestore query ${res.status}`);
  const results = await res.json();
  return results.filter((r: any) => r.document);
}

async function fsDelete(path: string) {
  const authH = await firebaseAuthHeader();
  const res = await fetch(`${BASE}/${path}?key=${API_KEY}`, { method: 'DELETE', headers: authH });
  if (!res.ok && res.status !== 404) throw new Error(`Firestore DELETE ${res.status}`);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClimbDiscipline = 'boulder' | 'top-rope' | 'lead' | 'trad';
export type GradeSystem     = 'kbc' | 'v-scale' | 'font' | 'yosemite';

export type Sector = {
  name: string;
  discipline: ClimbDiscipline;
  gradeSystem: GradeSystem;
};

export type ClimbLocation = {
  id: string;
  uid: string;
  name: string;
  type: 'indoor' | 'outdoor';
  sectors: Sector[];
  address: string;
  gps: string;
  useBadges: boolean;
  createdAt: string;
};

/** locationId === 'kbc' for KBC gym climbs */
export type PersonalClimb = {
  id: string;
  uid: string;
  userName?: string;            // display name of the climber (optional; absent in older records)
  photo?: string;               // base64 data URI or '' — optional, absent in older records
  locationId: string;
  boulderId: string;            // KBC only; '' otherwise (legacy; prefer problemInternalId)
  sectorId: string;
  timestamp: string;            // ISO — when the climb happened
  name: string;
  establishedGrade: string;
  personalGrade: string;        // grade label text (e.g. 'Purple', 'V5')
  gradeVote: number | null;     // numeric 0–4 (KBC) or null; used for aggregate avg
  problemInternalId: string;    // links to Boulder.internalId or PersonalProblem.internalId; '' for free-form
  quality: number;              // 0 = no vote, 1–3
  effort: string | number;      // '' | legacy string | 0–100 continuous scale
  type: 'ascent' | 'attempt';
  project: boolean;
  attempts: number;             // 1–99; 0 = not recorded
  badges: string[];
  comment: string;
  createdAt: string;
};

// ─── Grade scales ─────────────────────────────────────────────────────────────

export const V_SCALE: string[] = [
  'VB', 'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9',
  'V10', 'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17',
];

export const FONT_SCALE: string[] = [
  '3', '4', '5', '5+',
  '6a', '6a+', '6b', '6b+', '6c', '6c+',
  '7a', '7a+', '7b', '7b+', '7c', '7c+',
  '8a', '8a+', '8b', '8b+', '8c', '8c+',
  '9a',
];

export const YDS_SCALE: string[] = [
  '5.0', '5.1', '5.2', '5.3', '5.4', '5.5', '5.6', '5.7', '5.8', '5.9',
  '5.10a', '5.10b', '5.10c', '5.10d',
  '5.11a', '5.11b', '5.11c', '5.11d',
  '5.12a', '5.12b', '5.12c', '5.12d',
  '5.13a', '5.13b', '5.13c', '5.13d',
  '5.14a', '5.14b', '5.14c', '5.14d',
  '5.15a', '5.15b', '5.15c', '5.15d',
];

export const KBC_GRADE_LABELS = ['White', 'Blue', 'Purple', 'Pink', 'Black'] as const;

export function gradesForSystem(gs: GradeSystem): string[] {
  if (gs === 'v-scale')  return V_SCALE;
  if (gs === 'font')     return FONT_SCALE;
  if (gs === 'yosemite') return YDS_SCALE;
  return [...KBC_GRADE_LABELS]; // 'kbc'
}

/** Returns valid grade systems for a discipline. Roped → yosemite only. */
export function gradeSystemsForDiscipline(d: ClimbDiscipline): GradeSystem[] {
  return d === 'boulder' ? ['v-scale', 'font'] : ['yosemite'];
}

// ─── Decode helpers ───────────────────────────────────────────────────────────

function docToLocation(doc: any): ClimbLocation {
  const id = doc.name.split('/').pop() as string;
  const d  = decodeDoc(doc);
  return {
    id,
    uid:       d.uid       ?? '',
    name:      d.name      ?? '',
    type:      d.type      ?? 'indoor',
    sectors:   Array.isArray(d.sectors) ? d.sectors as Sector[] : [],
    address:   d.address   ?? '',
    gps:       d.gps       ?? '',
    useBadges: d.useBadges ?? false,
    createdAt: d.createdAt ?? '',
  };
}

function docToClimb(doc: any): PersonalClimb {
  const id = doc.name.split('/').pop() as string;
  const d  = decodeDoc(doc);
  return {
    id,
    uid:               d.uid               ?? '',
    userName:          d.userName          ?? undefined,
    photo:             d.photo             ?? '',
    locationId:        d.locationId        ?? '',
    boulderId:         d.boulderId         ?? '',
    sectorId:          d.sectorId          ?? '',
    timestamp:         d.timestamp         ?? d.createdAt ?? '',
    name:              d.name              ?? '',
    establishedGrade:  d.establishedGrade  ?? '',
    personalGrade:     d.personalGrade     ?? '',
    gradeVote:         typeof d.gradeVote === 'number' ? d.gradeVote : null,
    problemInternalId: d.problemInternalId ?? '',
    quality:           typeof d.quality === 'number' ? d.quality : 0,
    effort:            d.effort            ?? '',
    type:              d.type              ?? 'attempt',
    project:           d.project           ?? false,
    attempts:          typeof d.attempts === 'number' ? d.attempts : 0,
    badges:            Array.isArray(d.badges) ? d.badges : [],
    comment:           d.comment           ?? '',
    createdAt:         d.createdAt         ?? '',
  };
}

// ─── Locations API ────────────────────────────────────────────────────────────

export async function getMyLocations(uid: string): Promise<ClimbLocation[]> {
  // No orderBy — equality filter + orderBy on a different field requires a composite index.
  // Sort client-side instead.
  const docs = await fsQuery({
    from: [{ collectionId: 'climbLocations' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'uid' },
        op: 'EQUAL',
        value: { stringValue: uid },
      },
    },
    limit: 200,
  });
  return docs
    .map(r => docToLocation(r.document))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createLocation(data: Omit<ClimbLocation, 'id'>): Promise<ClimbLocation> {
  const doc = await fsPost('climbLocations', data);
  return docToLocation(doc);
}

export async function updateLocation(id: string, updates: Partial<Omit<ClimbLocation, 'id'>>): Promise<void> {
  await fsPatch(`climbLocations/${id}`, updates, Object.keys(updates));
}

export async function deleteLocation(id: string): Promise<void> {
  await fsDelete(`climbLocations/${id}`);
}

// ─── Climb Logs API ───────────────────────────────────────────────────────────

export async function getMyLogs(uid: string, locationId?: string): Promise<PersonalClimb[]> {
  const uidFilter = {
    fieldFilter: {
      field: { fieldPath: 'uid' },
      op: 'EQUAL',
      value: { stringValue: uid },
    },
  };

  const where = locationId
    ? {
        compositeFilter: {
          op: 'AND',
          filters: [
            uidFilter,
            {
              fieldFilter: {
                field: { fieldPath: 'locationId' },
                op: 'EQUAL',
                value: { stringValue: locationId },
              },
            },
          ],
        },
      }
    : uidFilter;

  // No orderBy — equality filter + orderBy requires a composite index. Sort client-side.
  const docs = await fsQuery({
    from: [{ collectionId: 'climbLogs' }],
    where,
    limit: 500,
  });
  return docs
    .map(r => docToClimb(r.document))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function addClimb(entry: Omit<PersonalClimb, 'id'>): Promise<PersonalClimb> {
  const doc = await fsPost('climbLogs', entry);
  return docToClimb(doc);
}

export async function updateClimb(id: string, updates: Partial<Omit<PersonalClimb, 'id'>>): Promise<void> {
  await fsPatch(`climbLogs/${id}`, updates, Object.keys(updates));
}

export async function deleteClimb(id: string): Promise<void> {
  await fsDelete(`climbLogs/${id}`);
}

/** Fetches all KBC climb logs across all users — used to compute aggregate stats for ClimbCards. */
export async function getKBCLogs(): Promise<PersonalClimb[]> {
  const docs = await fsQuery({
    from: [{ collectionId: 'climbLogs' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'locationId' },
        op: 'EQUAL',
        value: { stringValue: 'kbc' },
      },
    },
    limit: 2000,
  });
  return docs
    .map(r => docToClimb(r.document))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
