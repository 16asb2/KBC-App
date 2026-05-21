import { generateId } from '@/utils/id';
import { ClimbDiscipline, GradeSystem } from '@/services/climblog';
import { fetchWithAuth } from '@/services/authBridge';

const PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!;
const API_KEY    = process.env.EXPO_PUBLIC_FIREBASE_API_KEY!;
const BASE       = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const QUERY_URL  = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;

// ─── Firestore REST helpers ───────────────────────────────────────────────────

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
  const res = await fetchWithAuth(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encodeDoc(data)),
  });
  if (!res.ok) throw new Error(`Firestore PATCH ${res.status}`);
  return res.json();
}

async function fsPost(col: string, data: Record<string, any>) {
  const res = await fetchWithAuth(`${BASE}/${col}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encodeDoc(data)),
  });
  if (!res.ok) throw new Error(`Firestore POST ${res.status}`);
  return res.json();
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

async function fsDelete(path: string) {
  const res = await fetchWithAuth(`${BASE}/${path}?key=${API_KEY}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Firestore DELETE ${res.status}`);
}

// ─── Type ─────────────────────────────────────────────────────────────────────

export type PersonalProblem = {
  id:          string;   // Firestore doc ID
  internalId:  string;   // stable cross-db reference; used in climbLogs.problemInternalId
  uid:         string;   // owner
  name:        string;
  local:       string;   // location / gym / crag name
  area:        string;   // sector or sub-area
  discipline:  ClimbDiscipline;
  gradeSystem: GradeSystem;
  grade:       string;   // established / setter grade (free text)
  description: string;
  permissions: { view: 'private' | 'public'; edit: 'owner' };
  createdAt:   string;
  updatedAt:   string;
};

// ─── Decode ───────────────────────────────────────────────────────────────────

function docToProblem(doc: any): PersonalProblem {
  const id = doc.name.split('/').pop() as string;
  const d  = decodeDoc(doc);
  return {
    id,
    internalId:  d.internalId  ?? id,
    uid:         d.uid         ?? '',
    name:        d.name        ?? '',
    local:       d.local       ?? '',
    area:        d.area        ?? '',
    discipline:  d.discipline  ?? 'boulder',
    gradeSystem: d.gradeSystem ?? 'v-scale',
    grade:       d.grade       ?? '',
    description: d.description ?? '',
    permissions: d.permissions ?? { view: 'private', edit: 'owner' },
    createdAt:   d.createdAt   ?? '',
    updatedAt:   d.updatedAt   ?? '',
  };
}

// ─── API ──────────────────────────────────────────────────────────────────────

export async function getMyProblems(uid: string): Promise<PersonalProblem[]> {
  const docs = await fsQuery({
    from: [{ collectionId: 'personalProblems' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'uid' },
        op: 'EQUAL',
        value: { stringValue: uid },
      },
    },
    limit: 500,
  });
  return docs
    .map(r => docToProblem(r.document))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createProblem(
  data: Omit<PersonalProblem, 'id' | 'internalId'>,
): Promise<PersonalProblem> {
  const full = { ...data, internalId: generateId() };
  const doc  = await fsPost('personalProblems', full);
  return docToProblem(doc);
}

export async function updateProblem(
  id: string,
  updates: Partial<Omit<PersonalProblem, 'id' | 'internalId' | 'uid'>>,
): Promise<void> {
  const data = { ...updates, updatedAt: new Date().toISOString() };
  await fsPatch(`personalProblems/${id}`, data, Object.keys(data));
}

export async function deleteProblem(id: string): Promise<void> {
  await fsDelete(`personalProblems/${id}`);
}
