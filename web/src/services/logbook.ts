import { collection, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// Same `logs/{id}` and `gymStatus/current` documents mobile/services/logbook.ts
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

function makeId(timestamp: string): string {
  const base = timestamp.replace(/[:.]/g, '-').slice(0, 23)
  return `${base}-${Math.random().toString(36).slice(2, 7)}`
}

export async function addLogEntry(entry: Omit<LogEntry, 'id'>): Promise<void> {
  const id = makeId(entry.timestamp)
  await setDoc(doc(collection(db, 'logs'), id), entry)
}

// ─── Gym Open Status ─────────────────────────────────────────────────────────
// Stored in `gymStatus/current` — updated whenever a supervisor signs in.
// closesAt = 2 hours after the supervisor's sign-in timestamp.
//
// NOTE: unused for display, matching mobile exactly. mobile/'s Home screen
// derives its displayed gym-status banner from Calendar events instead (see
// domain/calendarEvent.ts's getGymStatusFromEvents, ported from
// mobile/app/(tabs)/home.tsx's own local getGymStatus(events)) — this
// Firestore-backed version is what mobile/services/logbook.ts exports but
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
