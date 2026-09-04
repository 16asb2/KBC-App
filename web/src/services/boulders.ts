import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  setDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { GRADE_BAND_COUNT, averageGradeIndex } from '@/domain/gradeVote'
import { generateId } from '@/utils/id'

// Same `boulders/{id}`, `boulders/{id}/comments/{id}`, `boulderSeasons/{id}`,
// `boulderConfig/main`, and `userBoulderData/{uid}` documents mobile/'s
// services/boulders.ts reads and writes. Unlike services/profiles.ts's
// `users` collection, these store nested objects/arrays (permissions,
// gradeVotes, locations, sectors, ...) as native Firestore maps/arrays, not
// JSON-stringified strings — mobile's hand-rolled REST encoder already
// produces mapValue/arrayValue for objects/arrays here, which is exactly
// what the modular SDK does for a plain JS object/array too. So plain
// objects can be passed straight through to setDoc/updateDoc/addDoc below;
// there's no JSON.stringify convention to preserve in this collection.

export const LOCATIONS = ['Cave Right', 'Cave Middle', 'Cave Left', 'Green Wall', 'Blue Wall', 'Yellow Wall'] as const
export type Location = (typeof LOCATIONS)[number]

export const GRADES = ['White', 'Blue', 'Purple', 'Pink', 'Black'] as const

// `domain/gradeVote.ts` cannot import this — it would pull `lib/firebase` in
// behind it and stop being testable in a plain Node process — so it carries the
// band count as a constant and this is where the two are held together. A grade
// added to the scale without updating it would silently make every vote read as
// the wrong band.
if (import.meta.env.DEV && GRADES.length !== GRADE_BAND_COUNT) {
  console.error(
    `[boulders] GRADES has ${GRADES.length} entries but domain/gradeVote.ts is built for ` +
      `${GRADE_BAND_COUNT}. Update GRADE_BAND_COUNT.`,
  )
}
export const GRADE_COLORS = ['#e8e8e8', '#00b4d8', '#9b5de5', '#f5a5c9', '#1a1a1a']
export const GRADE_TEXT = ['#555', '#fff', '#fff', '#fff', '#fff']
export type Grade = (typeof GRADES)[number]

export const BADGE_GROUPS = [
  {
    title: 'Hold Types',
    badges: [
      'Jugs', 'Crimps', 'Slopers', 'Pinches', 'Pockets', 'Underclings',
      'Side Pulls', 'Gaston', 'Crack', 'Small-feet', 'Slippery-feet',
    ],
  },
  {
    title: 'Climbing Technique',
    badges: [
      'Balancing', 'Drop Knee', 'Flagging', 'Heel Hook', 'Toe Hook', 'Bicycle',
      'Deadpoint', 'Compression', 'Dyno', 'Double Dyno', 'Campus', 'Bat Hang',
      'Hand-Jam', 'Finger-Jam', 'Foot-Jam',
    ],
  },
  {
    title: 'Body Dependent',
    badges: ['Flexibility', 'Reachy', 'Shouldery', 'Body Tension', 'Contortionism', 'Small-fit'],
  },
] as const

export const BADGES: readonly string[] = BADGE_GROUPS.flatMap((g) => [...g.badges])
export type Badge = (typeof BADGES)[number]

export type BoulderSeason = {
  id: string
  name: string
  createdAt: string
}

export type Boulder = {
  id: string
  internalId: string // stable cross-db reference; used in climbLogs.problemInternalId
  local: string // always 'KBC'
  area: string // always 'Boulders'
  permissions: { view: 'members'; edit: 'admin' }
  seasonId: string
  number: number
  name: string
  tapeColor: string // tape color used to mark the route (required)
  setter: string // empty string = unknown setter
  setterEmail: string
  createdByUid: string // uid of the member who added this boulder
  createdAt: string
  updatedAt: string
  locations: string[] // wall sections (Cave Right, etc.)
  photo: string
  removed: boolean
  likes: string[] // UIDs of users who liked this boulder
  setterGradeVote: number | null // setter's initial grade vote (stored on boulder, not a log)
  setterBadges: string[] // setter's initial badge picks (stored on boulder, not a log)
  gradeVotes: Record<string, number> // community grade votes; key=uid, value=grade index 0-4
  qualityVotes: Record<string, number> // community quality votes; key=uid, value=1-3 stars
}

export type BoulderComment = {
  id: string
  uid: string
  name: string
  text: string
  createdAt: string
}

/**
 * The community's grade, as an index on `GRADES`.
 *
 * The votes are averaged as they are — analog, exactly where each person
 * pressed — and the mean is then **truncated** into the band it falls in. See
 * `domain/gradeVote.ts`: rounding to the nearest whole index asks which band
 * *boundary* the average is nearest, which is why several votes low in Black
 * used to come back as Pink.
 */
export function avgGrade(votes: Record<string, number>): number | null {
  return averageGradeIndex(Object.values(votes))
}

export function avgQuality(votes: Record<string, number>): number | null {
  const vals = Object.values(votes)
  if (!vals.length) return null
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

// ─── Tape Color Pool ─────────────────────────────────────────────────────────

export async function getTapeColorPool(): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, 'boulderConfig', 'main'))
    if (!snap.exists()) return []
    const tapeColors = snap.data().tapeColors
    return Array.isArray(tapeColors) ? (tapeColors as string[]).filter(Boolean) : []
  } catch {
    return []
  }
}

export async function saveTapeColorPool(colors: string[]): Promise<void> {
  await setDoc(doc(db, 'boulderConfig', 'main'), { tapeColors: colors }, { merge: true })
}

// ─── Seasons ──────────────────────────────────────────────────────────────────

function docToSeason(id: string, d: Record<string, unknown>): BoulderSeason {
  return { id, name: (d.name as string) ?? '', createdAt: (d.createdAt as string) ?? '' }
}

export async function getSeasons(): Promise<BoulderSeason[]> {
  const snap = await getDocs(collection(db, 'boulderSeasons'))
  return snap.docs
    .map((d) => docToSeason(d.id, d.data()))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function createSeason(name: string): Promise<BoulderSeason> {
  const data = { name, createdAt: new Date().toISOString() }
  const ref = await addDoc(collection(db, 'boulderSeasons'), data)
  return docToSeason(ref.id, data)
}

// ─── Boulders ─────────────────────────────────────────────────────────────────

function docToBoulder(id: string, d: Record<string, unknown>): Boulder {
  return {
    id,
    internalId: (d.internalId as string) ?? id, // fall back to doc ID for old documents
    local: (d.local as string) ?? 'KBC',
    area: (d.area as string) ?? 'Boulders',
    permissions: (d.permissions as Boulder['permissions']) ?? { view: 'members', edit: 'admin' },
    seasonId: (d.seasonId as string) ?? '',
    number: (d.number as number) ?? 0,
    name: (d.name as string) ?? '',
    tapeColor: (d.tapeColor as string) ?? '',
    setter: (d.setter as string) ?? '',
    setterEmail: (d.setterEmail as string) ?? '',
    createdByUid: (d.createdByUid as string) ?? '',
    createdAt: (d.createdAt as string) ?? '',
    updatedAt: (d.updatedAt as string) ?? '',
    locations: Array.isArray(d.locations) ? (d.locations as string[]) : [],
    photo: (d.photo as string) ?? '',
    removed: (d.removed as boolean) ?? false,
    likes: Array.isArray(d.likes) ? (d.likes as string[]) : [],
    setterGradeVote: typeof d.setterGradeVote === 'number' ? d.setterGradeVote : null,
    setterBadges: Array.isArray(d.setterBadges) ? (d.setterBadges as string[]) : [],
    gradeVotes:
      typeof d.gradeVotes === 'object' && d.gradeVotes !== null && !Array.isArray(d.gradeVotes)
        ? (d.gradeVotes as Record<string, number>)
        : {},
    qualityVotes:
      typeof d.qualityVotes === 'object' && d.qualityVotes !== null && !Array.isArray(d.qualityVotes)
        ? (d.qualityVotes as Record<string, number>)
        : {},
  }
}

export async function getBouldersForSeason(seasonId: string): Promise<Boulder[]> {
  const snap = await getDocs(collection(db, 'boulders'))
  return snap.docs
    .map((d) => docToBoulder(d.id, d.data()))
    .filter((b) => b.seasonId === seasonId && !b.removed)
    .sort((a, b) => a.number - b.number)
}

export async function getNextBoulderNumber(seasonId: string): Promise<number> {
  const snap = await getDocs(collection(db, 'boulders'))
  const nums = snap.docs
    .map((d) => docToBoulder(d.id, d.data()))
    .filter((b) => b.seasonId === seasonId)
    .map((b) => b.number)
  return nums.length ? Math.max(...nums) + 1 : 1
}

export async function createBoulder(
  data: Omit<Boulder, 'id' | 'internalId' | 'local' | 'area' | 'permissions'>,
): Promise<Boulder> {
  const full = {
    ...data,
    internalId: generateId(),
    local: 'KBC',
    area: 'Boulders',
    permissions: { view: 'members' as const, edit: 'admin' as const },
  }
  const ref = await addDoc(collection(db, 'boulders'), full)
  return docToBoulder(ref.id, full)
}

export async function updateBoulder(id: string, updates: Partial<Omit<Boulder, 'id'>>): Promise<void> {
  await updateDoc(doc(db, 'boulders', id), { ...updates, updatedAt: new Date().toISOString() })
}

export async function removeBoulder(id: string): Promise<void> {
  await updateDoc(doc(db, 'boulders', id), { removed: true, updatedAt: new Date().toISOString() })
}

export async function toggleLike(id: string, uid: string, liked: boolean): Promise<void> {
  const snap = await getDoc(doc(db, 'boulders', id))
  const d = snap.exists() ? snap.data() : {}
  const current: string[] = Array.isArray(d.likes) ? (d.likes as string[]) : []
  const updated = liked ? current.filter((u) => u !== uid) : [...current.filter((u) => u !== uid), uid]
  await updateDoc(doc(db, 'boulders', id), { likes: updated, updatedAt: new Date().toISOString() })
}

export async function setQualityVote(
  id: string,
  uid: string,
  stars: number,
  currentVotes: Record<string, number>,
): Promise<void> {
  const updated = { ...currentVotes }
  if (stars <= 0) delete updated[uid]
  else updated[uid] = stars
  await updateDoc(doc(db, 'boulders', id), { qualityVotes: updated, updatedAt: new Date().toISOString() })
}

export async function getBoulderProjects(uid: string): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, 'userBoulderData', uid))
    if (!snap.exists()) return []
    const projectIds = snap.data().projectIds
    return Array.isArray(projectIds) ? (projectIds as string[]) : []
  } catch {
    return []
  }
}

export async function setBoulderProject(uid: string, internalId: string, isProject: boolean): Promise<void> {
  const current = await getBoulderProjects(uid)
  const updated = isProject
    ? [...current.filter((id) => id !== internalId), internalId]
    : current.filter((id) => id !== internalId)
  await setDoc(doc(db, 'userBoulderData', uid), { projectIds: updated }, { merge: true })
}

// ─── Comments ─────────────────────────────────────────────────────────────────

function docToComment(id: string, d: Record<string, unknown>): BoulderComment {
  return {
    id,
    uid: (d.uid as string) ?? '',
    name: (d.name as string) ?? '',
    text: (d.text as string) ?? '',
    createdAt: (d.createdAt as string) ?? '',
  }
}

export async function getComments(boulderId: string): Promise<BoulderComment[]> {
  const snap = await getDocs(collection(db, 'boulders', boulderId, 'comments'))
  return snap.docs.map((d) => docToComment(d.id, d.data())).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function addComment(boulderId: string, data: Omit<BoulderComment, 'id'>): Promise<BoulderComment> {
  const ref = await addDoc(collection(db, 'boulders', boulderId, 'comments'), data)
  return docToComment(ref.id, data)
}

export async function deleteComment(boulderId: string, commentId: string): Promise<void> {
  await deleteDoc(doc(db, 'boulders', boulderId, 'comments', commentId))
}
