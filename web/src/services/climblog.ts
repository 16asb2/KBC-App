import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// Same `climbLogs/{id}` and `climbLocations/{id}` documents mobile/'s
// services/climblog.ts reads and writes — see services/boulders.ts's header
// comment: nested fields here are native Firestore maps/arrays, not
// JSON-stringified strings, so plain objects pass straight through.

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClimbDiscipline = 'boulder' | 'top-rope' | 'lead' | 'trad'
export type GradeSystem = 'kbc' | 'v-scale' | 'font' | 'yosemite'

export type Sector = {
  name: string
  discipline: ClimbDiscipline
  gradeSystem: GradeSystem
}

export type ClimbLocation = {
  id: string
  uid: string
  name: string
  type: 'indoor' | 'outdoor'
  sectors: Sector[]
  address: string
  gps: string
  useBadges: boolean
  createdAt: string
}

/** locationId === 'kbc' for KBC gym climbs */
export type PersonalClimb = {
  id: string
  uid: string
  userName?: string // display name of the climber (optional; absent in older records)
  photo?: string // base64 data URI or '' — optional, absent in older records
  locationId: string
  boulderId: string // KBC only; '' otherwise (legacy; prefer problemInternalId)
  sectorId: string
  timestamp: string // ISO — when the climb happened
  name: string
  establishedGrade: string
  personalGrade: string // grade label text (e.g. 'Purple', 'V5')
  gradeVote: number | null // numeric 0–4 (KBC) or null; used for aggregate avg
  problemInternalId: string // links to Boulder.internalId or PersonalProblem.internalId; '' for free-form
  quality: number // 0 = no vote, 1–3
  effort: string | number // '' | legacy string | 0–100 continuous scale
  type: 'ascent' | 'attempt'
  project: boolean
  attempts: number // 1–99; 0 = not recorded
  badges: string[]
  comment: string
  createdAt: string
}

// ─── Grade scales ─────────────────────────────────────────────────────────────

export const V_SCALE: string[] = [
  'VB', 'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9',
  'V10', 'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17',
]

export const FONT_SCALE: string[] = [
  '3', '4', '5', '5+',
  '6a', '6a+', '6b', '6b+', '6c', '6c+',
  '7a', '7a+', '7b', '7b+', '7c', '7c+',
  '8a', '8a+', '8b', '8b+', '8c', '8c+',
  '9a',
]

export const YDS_SCALE: string[] = [
  '5.0', '5.1', '5.2', '5.3', '5.4', '5.5', '5.6', '5.7', '5.8', '5.9',
  '5.10a', '5.10b', '5.10c', '5.10d',
  '5.11a', '5.11b', '5.11c', '5.11d',
  '5.12a', '5.12b', '5.12c', '5.12d',
  '5.13a', '5.13b', '5.13c', '5.13d',
  '5.14a', '5.14b', '5.14c', '5.14d',
  '5.15a', '5.15b', '5.15c', '5.15d',
]

export const KBC_GRADE_LABELS = ['White', 'Blue', 'Purple', 'Pink', 'Black'] as const

export function gradesForSystem(gs: GradeSystem): string[] {
  if (gs === 'v-scale') return V_SCALE
  if (gs === 'font') return FONT_SCALE
  if (gs === 'yosemite') return YDS_SCALE
  return [...KBC_GRADE_LABELS] // 'kbc'
}

/** Returns valid grade systems for a discipline. Roped → yosemite only. */
export function gradeSystemsForDiscipline(d: ClimbDiscipline): GradeSystem[] {
  return d === 'boulder' ? ['v-scale', 'font'] : ['yosemite']
}

// ─── Decode helpers ───────────────────────────────────────────────────────────

function docToLocation(id: string, d: Record<string, unknown>): ClimbLocation {
  return {
    id,
    uid: (d.uid as string) ?? '',
    name: (d.name as string) ?? '',
    type: (d.type as ClimbLocation['type']) ?? 'indoor',
    sectors: Array.isArray(d.sectors) ? (d.sectors as Sector[]) : [],
    address: (d.address as string) ?? '',
    gps: (d.gps as string) ?? '',
    useBadges: (d.useBadges as boolean) ?? false,
    createdAt: (d.createdAt as string) ?? '',
  }
}

function docToClimb(id: string, d: Record<string, unknown>): PersonalClimb {
  return {
    id,
    uid: (d.uid as string) ?? '',
    userName: (d.userName as string) ?? undefined,
    photo: (d.photo as string) ?? '',
    locationId: (d.locationId as string) ?? '',
    boulderId: (d.boulderId as string) ?? '',
    sectorId: (d.sectorId as string) ?? '',
    timestamp: (d.timestamp as string) ?? (d.createdAt as string) ?? '',
    name: (d.name as string) ?? '',
    establishedGrade: (d.establishedGrade as string) ?? '',
    personalGrade: (d.personalGrade as string) ?? '',
    gradeVote: typeof d.gradeVote === 'number' ? d.gradeVote : null,
    problemInternalId: (d.problemInternalId as string) ?? '',
    quality: typeof d.quality === 'number' ? d.quality : 0,
    effort: (d.effort as string | number) ?? '',
    type: (d.type as PersonalClimb['type']) ?? 'attempt',
    project: (d.project as boolean) ?? false,
    attempts: typeof d.attempts === 'number' ? d.attempts : 0,
    badges: Array.isArray(d.badges) ? (d.badges as string[]) : [],
    comment: (d.comment as string) ?? '',
    createdAt: (d.createdAt as string) ?? '',
  }
}

// ─── Locations API ────────────────────────────────────────────────────────────

export async function getMyLocations(uid: string): Promise<ClimbLocation[]> {
  // No orderBy — equality filter + orderBy on a different field requires a composite index.
  const snap = await getDocs(query(collection(db, 'climbLocations'), where('uid', '==', uid)))
  return snap.docs.map((d) => docToLocation(d.id, d.data())).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function createLocation(data: Omit<ClimbLocation, 'id'>): Promise<ClimbLocation> {
  const ref = await addDoc(collection(db, 'climbLocations'), data)
  return docToLocation(ref.id, data)
}

export async function updateLocation(id: string, updates: Partial<Omit<ClimbLocation, 'id'>>): Promise<void> {
  await updateDoc(doc(db, 'climbLocations', id), updates)
}

export async function deleteLocation(id: string): Promise<void> {
  await deleteDoc(doc(db, 'climbLocations', id))
}

// ─── Climb Logs API ───────────────────────────────────────────────────────────

export async function getMyLogs(uid: string, locationId?: string): Promise<PersonalClimb[]> {
  const constraints = [where('uid', '==', uid)]
  if (locationId) constraints.push(where('locationId', '==', locationId))
  // No orderBy — equality filter + orderBy requires a composite index. Sort client-side.
  const snap = await getDocs(query(collection(db, 'climbLogs'), ...constraints))
  return snap.docs.map((d) => docToClimb(d.id, d.data())).sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export async function addClimb(entry: Omit<PersonalClimb, 'id'>): Promise<PersonalClimb> {
  const ref = await addDoc(collection(db, 'climbLogs'), entry)
  return docToClimb(ref.id, entry)
}

export async function updateClimb(id: string, updates: Partial<Omit<PersonalClimb, 'id'>>): Promise<void> {
  await updateDoc(doc(db, 'climbLogs', id), updates)
}

export async function deleteClimb(id: string): Promise<void> {
  await deleteDoc(doc(db, 'climbLogs', id))
}

/** Fetches all KBC climb logs across all users — used to compute aggregate stats for ClimbCards. */
export async function getKBCLogs(): Promise<PersonalClimb[]> {
  const snap = await getDocs(query(collection(db, 'climbLogs'), where('locationId', '==', 'kbc')))
  return snap.docs.map((d) => docToClimb(d.id, d.data())).sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}
