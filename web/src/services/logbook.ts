import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

// Same `logs/{id}` and `gymStatus/current` documents mobile@1cdfada/services/logbook.ts
// reads and writes — see web/src/services/profiles.ts for the shared-schema note.

export type LogEntry = {
  id: string
  timestamp: string // ISO
  userId: string
  userName: string
  accessType: string // e.g. "Active Member", "Drop-In", "Punch Pass (4 left)"
  notes?: string
  amendedBy?: string
  amendedAt?: string
  // Supervisor-confirmation workflow
  status?: 'pending' | 'verified' // undefined = supervisor-initiated (no confirmation needed)
  verifiedBy?: string
  verifiedAt?: string
}

export type AccessOption = {
  id: string
  label: string
  price: string
  detail?: string
  months?: number // if membership
  punches?: number // if punch pass
  isVoucher?: boolean
}

export const ACCESS_OPTIONS: AccessOption[] = [
  { id: 'dropin', label: 'Drop-In', price: '$20' },
  { id: 'punch10', label: '10× Punch Passes', price: '$160', punches: 10 },
  { id: 'mem1m', label: '1-month pass', price: '$55', months: 1 },
  { id: 'mem4m', label: '4-months pass', price: '$200 ($50/m)', months: 4 },
  { id: 'mem8m', label: '8-months pass', price: '$350 ($44/m)', months: 8 },
  { id: 'mem12m', label: 'Annual Pass', price: '$450 ($38/m)', months: 12 },
  { id: 'student12m', label: 'Student annual pass', price: '$350 ($44/m)', months: 12 },
  { id: 'voucher', label: 'Voucher', price: '—', isVoucher: true },
]

const LOGS = 'logs'

function makeId(timestamp: string): string {
  const base = timestamp.replace(/[:.]/g, '-').slice(0, 23)
  return `${base}-${Math.random().toString(36).slice(2, 7)}`
}

export async function addLogEntry(entry: Omit<LogEntry, 'id'>): Promise<void> {
  const id = makeId(entry.timestamp)
  await setDoc(doc(collection(db, LOGS), id), entry)
}

// ─── Reading the sign-in book ────────────────────────────────────────────────
// Ported from mobile@1cdfada/services/logbook.ts. mobile sorted client-side and left
// orderBy off deliberately, because its hand-rolled REST client could need an
// explicit descending index for a range filter plus orderBy on the same field.
// That constraint is gone with the real SDK, and dropping orderBy was never
// free: `limit` without an order returns an arbitrary slice, so a busy month
// could hide the newest sign-ins. A range filter and an orderBy on the *same*
// field are served by the automatic single-field index, so no index needs
// deploying for these two.

const RECENT_WINDOW_DAYS = 30

function toEntries(snap: Awaited<ReturnType<typeof getDocs>>): LogEntry[] {
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LogEntry, 'id'>) }))
}

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

/** Sign-ins from the last 30 days, newest first. */
export async function getRecentLogs(): Promise<LogEntry[]> {
  return toEntries(
    await getDocs(
      query(
        collection(db, LOGS),
        where('timestamp', '>=', daysAgo(RECENT_WINDOW_DAYS)),
        orderBy('timestamp', 'desc'),
        fsLimit(500),
      ),
    ),
  )
}

/** Everything older than the recent window, newest first. */
export async function getArchiveLogs(): Promise<LogEntry[]> {
  return toEntries(
    await getDocs(
      query(
        collection(db, LOGS),
        where('timestamp', '<', daysAgo(RECENT_WINDOW_DAYS)),
        orderBy('timestamp', 'desc'),
        fsLimit(300),
      ),
    ),
  )
}

/**
 * One member's full visit history, newest first.
 *
 * No orderBy: combining an equality filter on userId with orderBy timestamp
 * needs a composite index, which would have to be deployed separately. At KBC's
 * scale one member's history is small, so it is fetched whole and sorted here —
 * which also avoids `limit` silently truncating someone's history.
 */
export async function getUserLogs(uid: string): Promise<LogEntry[]> {
  const snap = await getDocs(query(collection(db, LOGS), where('userId', '==', uid)))
  return toEntries(snap).sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

/**
 * How many sign-ins are waiting on supervisor confirmation.
 *
 * Its own query rather than counting getRecentLogs(), which pulls up to 500
 * documents — this runs on Home for every supervisor on every visit. Equality
 * on a single field uses the automatic index, so nothing needs deploying.
 */
export async function getPendingSignInCount(): Promise<number> {
  const snap = await getDocs(
    query(collection(db, LOGS), where('status', '==', 'pending'), fsLimit(100)),
  )
  return snap.size
}

// ─── Supervisor actions ──────────────────────────────────────────────────────
// firestore.rules allows update and delete on logs/{id} only for supervisors
// and admins, so these fail closed for an ordinary member regardless of the
// client-side gating on the page.

/** Confirm a member-initiated sign-in that is awaiting supervisor approval. */
export async function verifyLogEntry(id: string, verifiedBy: string): Promise<void> {
  await updateDoc(doc(db, LOGS, id), {
    status: 'verified',
    verifiedBy,
    verifiedAt: new Date().toISOString(),
  })
}

/** Amend the access type or notes on an existing entry, recording who did it. */
export async function updateLogEntry(
  id: string,
  updates: Partial<Pick<LogEntry, 'accessType' | 'notes'>>,
  byEmail: string,
): Promise<void> {
  await updateDoc(doc(db, LOGS, id), {
    ...updates,
    amendedBy: byEmail,
    amendedAt: new Date().toISOString(),
  })
}

export async function deleteLogEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, LOGS, id))
}

// ─── Gym Open Status ─────────────────────────────────────────────────────────
// Stored in `gymStatus/current` — updated whenever a supervisor signs in.
// closesAt = 2 hours after the supervisor's sign-in timestamp.
//
// NOTE: unused for display, matching mobile exactly. mobile/'s Home screen
// derives its displayed gym-status banner from Calendar events instead (see
// domain/calendarEvent.ts's getGymStatusFromEvents, ported from
// mobile@1cdfada/app/(tabs)/home.tsx's own local getGymStatus(events)) — this
// Firestore-backed version is what mobile@1cdfada/services/logbook.ts exports but
// nothing there actually calls for display either. Kept for parity with
// mobile's public API; setGymOpen() below is still very much live.

export type GymStatus = {
  open: boolean
  openedBy?: string // display name of the supervisor who signed in
  openedAt?: string // ISO timestamp of sign-in
  closesAt?: string // ISO timestamp when the "open" indication expires
}

export async function getGymStatus(): Promise<GymStatus> {
  try {
    const snap = await getDoc(doc(db, 'gymStatus', 'current'))
    if (!snap.exists()) return { open: false }
    const d = snap.data() as Partial<GymStatus>
    const open = !!d.closesAt && new Date(d.closesAt) > new Date()
    return { open, openedBy: d.openedBy, openedAt: d.openedAt, closesAt: d.closesAt }
  } catch {
    return { open: false }
  }
}

export async function setGymOpen(openedBy: string): Promise<void> {
  const openedAt = new Date().toISOString()
  const closesAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
  await setDoc(doc(db, 'gymStatus', 'current'), { openedBy, openedAt, closesAt }, { merge: true })
}
