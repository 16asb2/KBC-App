import type { LogEntry } from '@/services/logbook'

// Pure logic for the sign-in book. Ported from the inline filtering in
// mobile/app/(tabs)/logbook.tsx, pulled out into plain functions so it can be
// unit tested without Firestore — see the pure-logic-first note in web/CLAUDE.md.

/**
 * Purchase records share the `logs` collection with sign-ins: buying access
 * writes an entry whose notes begin with "Purchased:". Ordinary members
 * shouldn't see what other people bought, so those rows are dropped for them.
 */
export function isPurchaseEntry(entry: LogEntry): boolean {
  return entry.notes?.startsWith('Purchased:') ?? false
}

export type LogFilter = {
  search: string
  mineOnly: boolean
  /** Current user's uid — only needed when mineOnly is set. */
  uid?: string
  /** Supervisors and admins see purchase rows; members don't. */
  canSeePurchases: boolean
}

export function filterLogs(entries: LogEntry[], f: LogFilter): LogEntry[] {
  const search = f.search.trim().toLowerCase()
  return entries.filter((e) => {
    if (!f.canSeePurchases && isPurchaseEntry(e)) return false
    if (f.mineOnly && e.userId !== f.uid) return false
    if (search && !e.userName.toLowerCase().includes(search)) return false
    return true
  })
}

export type LogDay = {
  /** Stable key for the calendar day, e.g. "Mon Aug 23 2026". */
  key: string
  entries: LogEntry[]
}

/**
 * Group entries into calendar days, preserving the newest-first order they
 * arrive in. Grouping on the local day string rather than the ISO date so a
 * late-evening sign-in lands on the day it felt like to the member, not the
 * UTC day.
 */
export function groupLogsByDay(entries: LogEntry[]): LogDay[] {
  const days: LogDay[] = []
  for (const e of entries) {
    const key = new Date(e.timestamp).toDateString()
    const last = days[days.length - 1]
    if (last && last.key === key) last.entries.push(e)
    else days.push({ key, entries: [e] })
  }
  return days
}

/**
 * Whether removing `entry` should also clear that member's `lastSignInAt`.
 *
 * Home enforces one sign-in per day off `lastSignInAt`. Deleting or denying
 * someone's only sign-in for today would otherwise lock them out until
 * tomorrow, so the stamp is cleared — but only if nothing else today still
 * counts as a sign-in. Purchase rows don't count: buying access is not
 * attending.
 *
 * `remaining` is the list with `entry` already removed.
 */
export function shouldResetLastSignIn(
  entry: LogEntry,
  remaining: LogEntry[],
  now: Date = new Date(),
): boolean {
  if (!entry.userId) return false
  const today = now.toDateString()
  if (new Date(entry.timestamp).toDateString() !== today) return false
  return !remaining.some(
    (l) =>
      l.userId === entry.userId &&
      new Date(l.timestamp).toDateString() === today &&
      !isPurchaseEntry(l),
  )
}

/** Colour key for an access type, matching mobile's accessColor(). */
export function accessKind(accessType: string): 'member' | 'punch' | 'dropin' | 'other' {
  const t = accessType.toLowerCase()
  if (t.includes('member')) return 'member'
  if (t.includes('punch')) return 'punch'
  if (t.includes('drop')) return 'dropin'
  return 'other'
}
