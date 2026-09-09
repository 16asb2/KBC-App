import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  updateDoc,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { GRADE_BAND_COUNT, averageGradeIndex } from '@/domain/gradeVote'
import { generateId } from '@/utils/id'
import { deletePhoto, readPhoto, writePhoto } from '@/services/photoStore'

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

/**
 * Hold types that are meaningfully different at two sizes — a small crimp and
 * a large crimp are not the same problem. `Small `/`Large ` prefixes are a
 * naming convention, not a data structure: `baseHoldBadge()` in
 * `components/BadgeIcon.tsx` strips them to pick the drawing and the colour.
 */
export const SIZED_HOLDS = ['Jugs', 'Crimps', 'Slopers', 'Pinches'] as const

export const BADGE_GROUPS = [
  {
    title: 'Hold Types',
    badges: [
      // The four sized holds each come in three flavours: the unsized original
      // and a Small/Large pair. The original is kept rather than replaced —
      // every climb logged before the split records a bare 'Jugs'/'Crimps'/
      // 'Slopers'/'Pinches', and dropping it would orphan those badge counts.
      ...SIZED_HOLDS.flatMap((hold) => [hold, `Small ${hold}`, `Large ${hold}`]),
      'Pockets', 'Underclings',
      'Side Pulls', 'Gaston', 'Crack', 'Small-feet', 'Slippery-feet',
    ],
  },
  {
    title: 'Climbing Technique',
    badges: [
      'Balancing', 'Drop Knee', 'Flagging', 'Heel Hook', 'Toe Hook', 'Bicycle',
      'Deadpoint', 'Compression', 'Dyno', 'Double Dyno', 'Campus', 'Bat Hang',
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
  // The full picture is deliberately NOT here — it lives in
  // `boulders/{id}/media/main` and is fetched by `getBoulderPhoto()` when the
  // overview opens. It used to be a field, and so was downloaded by every read
  // of this collection. See services/photoStore.ts.
  thumb: string // small square JPEG data URI derived from the photo; '' = none. Drawn as the card's round icon.
  hasPhoto: boolean // whether a full picture exists to fetch
  removed: boolean
  likes: string[] // UIDs of users who liked this boulder
  setterGradeVote: number | null // setter's initial grade vote (stored on boulder, not a log)
  setterBadges: string[] // setter's initial badge picks (stored on boulder, not a log)
  gradeVotes: Record<string, number> // community grade votes; key=uid, value=grade index 0-4
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
    thumb: (d.thumb as string) ?? '',
    // Trust the explicit flag where it exists. Infer it otherwise: `thumb` is
    // derived from a picture so implies one, and `photo` is the legacy field,
    // still set on any boulder scripts/migrate-photos.mjs has not moved yet.
    hasPhoto: typeof d.hasPhoto === 'boolean' ? d.hasPhoto : Boolean(d.thumb || d.photo),
    removed: (d.removed as boolean) ?? false,
    likes: Array.isArray(d.likes) ? (d.likes as string[]) : [],
    setterGradeVote: typeof d.setterGradeVote === 'number' ? d.setterGradeVote : null,
    setterBadges: Array.isArray(d.setterBadges) ? (d.setterBadges as string[]) : [],
    gradeVotes:
      typeof d.gradeVotes === 'object' && d.gradeVotes !== null && !Array.isArray(d.gradeVotes)
        ? (d.gradeVotes as Record<string, number>)
        : {},
  }
}

/**
 * One season's problems.
 *
 * Filtered on the server. This used to read the whole `boulders` collection and
 * pick the season out in JS, which meant every visit to the Boulders tab
 * downloaded every problem the gym has ever set — including removed ones —
 * and each of those documents carries a base64 `photo` field. On a phone that
 * is the difference between a few hundred kB and several MB per load, and it
 * is the first thing to fix for iOS Safari, whose memory ceiling is far lower
 * than Android Chrome's. See DESIGN.md.
 *
 * `removed` stays a client-side filter: soft-deleted problems are rare, and
 * a second equality clause would be one more index to keep alive for almost
 * no traffic saved.
 */
export async function getBouldersForSeason(seasonId: string): Promise<Boulder[]> {
  const snap = await getDocs(query(collection(db, 'boulders'), where('seasonId', '==', seasonId)))
  return snap.docs
    .map((d) => docToBoulder(d.id, d.data()))
    .filter((b) => !b.removed)
    .sort((a, b) => a.number - b.number)
}

export async function getNextBoulderNumber(seasonId: string): Promise<number> {
  const snap = await getDocs(query(collection(db, 'boulders'), where('seasonId', '==', seasonId)))
  const nums = snap.docs.map((d) => (d.data().number as number) ?? 0)
  return nums.length ? Math.max(...nums) + 1 : 1
}

/**
 * Create a boulder. `photo` is stored separately from the document — see
 * `services/photoStore.ts` — so it is passed alongside rather than within.
 */
export async function createBoulder(
  data: Omit<Boulder, 'id' | 'internalId' | 'local' | 'area' | 'permissions' | 'hasPhoto'>,
  photo = '',
): Promise<Boulder> {
  const { ...fields } = data
  const full = {
    ...fields,
    hasPhoto: Boolean(photo),
    internalId: generateId(),
    local: 'KBC',
    area: 'Boulders',
    permissions: { view: 'members' as const, edit: 'admin' as const },
  }
  const ref = await addDoc(collection(db, 'boulders'), full)
  if (photo) await writePhoto('boulders', ref.id, photo)
  return docToBoulder(ref.id, full)
}

export async function updateBoulder(id: string, updates: Partial<Omit<Boulder, 'id'>>): Promise<void> {
  await updateDoc(doc(db, 'boulders', id), { ...updates, updatedAt: new Date().toISOString() })
}

/** The boulder's full picture, fetched only when something is about to show it. */
export async function getBoulderPhoto(boulderId: string): Promise<string> {
  return readPhoto('boulders', boulderId)
}

/**
 * Store or clear the boulder's full picture. Admin/supervisor only, per the rules.
 *
 * Also maintains `hasPhoto` on the boulder itself, because that flag is the
 * only thing telling the overview whether a fetch is worth making — and a flag
 * kept in step by its callers rather than by the write it describes is a flag
 * that eventually lies.
 */
export async function setBoulderPhoto(boulderId: string, photo: string): Promise<void> {
  await writePhoto('boulders', boulderId, photo)
  await updateDoc(doc(db, 'boulders', boulderId), { hasPhoto: Boolean(photo) })
}

/**
 * Soft-delete. The picture goes with it: `removed` boulders are filtered out of
 * every read, so nothing would ever fetch the media document again, and a
 * subcollection is not removed by deleting its parent even when that day comes.
 */
export async function removeBoulder(id: string): Promise<void> {
  await updateDoc(doc(db, 'boulders', id), {
    removed: true,
    hasPhoto: false,
    updatedAt: new Date().toISOString(),
  })
  await deletePhoto('boulders', id)
}

export async function toggleLike(id: string, uid: string, liked: boolean): Promise<void> {
  const snap = await getDoc(doc(db, 'boulders', id))
  const d = snap.exists() ? snap.data() : {}
  const current: string[] = Array.isArray(d.likes) ? (d.likes as string[]) : []
  const updated = liked ? current.filter((u) => u !== uid) : [...current.filter((u) => u !== uid), uid]
  await updateDoc(doc(db, 'boulders', id), { likes: updated, updatedAt: new Date().toISOString() })
}

/**
 * A member's own boulder data — their projects and their star ratings.
 *
 * `userBoulderData/{uid}` is readable and writable by its owner and by nobody
 * else (`firestore.rules`), which is the whole point for `ratings`: a star
 * rating is a private note to yourself, not a score the gym publishes. It used
 * to live in a `qualityVotes` map on the boulder itself, where every member
 * could read every other member's vote and the average was printed on the
 * card. That community rating is gone; this replaced it.
 */
export type UserBoulderData = {
  projectIds: string[]
  /** key = Boulder.internalId, value = 1–3 stars. Absent = not rated. */
  ratings: Record<string, number>
}

const EMPTY_USER_BOULDER_DATA: UserBoulderData = { projectIds: [], ratings: {} }

export async function getUserBoulderData(uid: string): Promise<UserBoulderData> {
  try {
    const snap = await getDoc(doc(db, 'userBoulderData', uid))
    if (!snap.exists()) return EMPTY_USER_BOULDER_DATA
    const d = snap.data()
    const ratings = d.ratings
    return {
      projectIds: Array.isArray(d.projectIds) ? (d.projectIds as string[]) : [],
      ratings:
        typeof ratings === 'object' && ratings !== null && !Array.isArray(ratings)
          ? (ratings as Record<string, number>)
          : {},
    }
  } catch {
    return EMPTY_USER_BOULDER_DATA
  }
}

/**
 * Replace this member's project list.
 *
 * Takes the whole list, and so does `saveBoulderRatings` below. Both used to
 * read the document, edit one entry and write it back, which loses an edit
 * whenever two land close together: mark a project and rate a boulder in quick
 * succession and the second read still sees the state from before the first
 * write. The caller already holds the current value in component state — that
 * is the copy edits are applied to in order — so it passes the result and
 * these just store it.
 *
 * The two fields are written separately with `merge`, so a projects write and
 * a ratings write never overwrite each other's field.
 */
export async function saveBoulderProjects(uid: string, projectIds: string[]): Promise<void> {
  await setDoc(doc(db, 'userBoulderData', uid), { projectIds }, { merge: true })
}

/** Replace this member's ratings map: key = Boulder.internalId, value = 1–3. */
export async function saveBoulderRatings(uid: string, ratings: Record<string, number>): Promise<void> {
  // The map is written whole rather than as a `ratings.<id>` field path: an
  // internalId is generated, and a field path containing a '.' would address a
  // nested map instead of the key it looks like.
  await setDoc(doc(db, 'userBoulderData', uid), { ratings }, { merge: true })
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
