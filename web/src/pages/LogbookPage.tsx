import { useCallback, useEffect, useState } from 'react'
import { Modal } from '@/components/Modal'
import { KBC } from '@/constants/theme'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { isAdmin } from '@/domain/roles'
import {
  accessKind,
  filterLogs,
  groupLogsByDay,
  shouldResetLastSignIn,
} from '@/domain/signInBook'
import {
  deleteLogEntry,
  getArchiveLogs,
  getRecentLogs,
  updateLogEntry,
  verifyLogEntry,
  type LogEntry,
} from '@/services/logbook'
import { updateProfile } from '@/services/profiles'

// Ported from mobile/app/(tabs)/logbook.tsx — the gym sign-in book, which is a
// different screen from the Log Book tab (that one is climblog, a member's own
// climbs). This never made it into the web port, which left member-initiated
// sign-ins written as status: 'pending' with nothing anywhere able to confirm
// them; see HomePage's logAndMarkSignedIn.

const ACCESS_COLORS: Record<ReturnType<typeof accessKind>, string> = {
  member: KBC.green,
  punch: KBC.cyan,
  dropin: KBC.purple,
  other: '#888',
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDayHeader(dayKey: string): string {
  const d = new Date(dayKey)
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 864e5).toDateString()
  if (dayKey === today) return 'Today'
  if (dayKey === yesterday) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

type Tab = 'recent' | 'archive' | 'mine'

export function LogbookPage() {
  const { user } = useAuth()
  const { profile } = useProfile()

  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('recent')
  const [search, setSearch] = useState('')
  const [amending, setAmending] = useState<LogEntry | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Supervisors and admins confirm sign-ins and amend entries; only admins
  // delete. firestore.rules enforces both — this is UX only.
  const canAmend = isAdmin(user?.email, profile?.isAdmin) || (profile?.isSupervisor ?? false)
  const canDelete = isAdmin(user?.email, profile?.isAdmin)

  const load = useCallback(async (which: Tab) => {
    setLoading(true)
    setError(null)
    try {
      setEntries(which === 'archive' ? await getArchiveLogs() : await getRecentLogs())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the sign-in book.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // 'mine' filters the recent window client-side rather than refetching.
    // load() flips the loading flag synchronously, which the lint rule reads as
    // a cascading render; it's the ordinary fetch-on-mount shape used across
    // these pages (see MembersPage) and the same exemption ProfileContext takes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(tab === 'archive' ? 'archive' : 'recent')
  }, [tab, load])

  const visible = filterLogs(entries, {
    search,
    mineOnly: tab === 'mine',
    uid: user?.uid,
    canSeePurchases: canAmend,
  })
  const days = groupLogsByDay(visible)
  const pendingCount = entries.filter((e) => e.status === 'pending').length

  async function handleVerify(entry: LogEntry) {
    const verifier = profile?.preferredName || profile?.name || user?.email || 'Supervisor'
    setBusyId(entry.id)
    try {
      await verifyLogEntry(entry.id, verifier)
      setEntries((prev) =>
        prev.map((l) =>
          l.id === entry.id ? { ...l, status: 'verified' as const, verifiedBy: verifier } : l,
        ),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not confirm that sign-in.')
    } finally {
      setBusyId(null)
    }
  }

  /**
   * Removing someone's only sign-in for today has to clear lastSignInAt too,
   * or Home's one-per-day rule locks them out until tomorrow. Used by both
   * delete and deny — denying a pending entry removes it, same as mobile.
   */
  async function removeEntry(entry: LogEntry) {
    setBusyId(entry.id)
    try {
      await deleteLogEntry(entry.id)
      const remaining = entries.filter((l) => l.id !== entry.id)
      setEntries(remaining)
      if (shouldResetLastSignIn(entry, remaining)) {
        await updateProfile(entry.userId, { lastSignInAt: undefined }, user?.email ?? 'unknown')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that entry.')
    } finally {
      setBusyId(null)
    }
  }

  function confirmRemove(entry: LogEntry, verb: 'Delete' | 'Deny') {
    const when = new Date(entry.timestamp).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    const msg =
      verb === 'Deny'
        ? `Deny ${entry.userName}'s pending sign-in from ${when}?`
        : `Remove ${entry.userName}'s sign-in from ${when}?`
    if (window.confirm(msg)) void removeEntry(entry)
  }

  async function handleAmend(entry: LogEntry, accessType: string, notes: string) {
    await updateLogEntry(entry.id, { accessType, notes: notes || undefined }, user?.email ?? '')
    setEntries((prev) =>
      prev.map((l) =>
        l.id === entry.id
          ? { ...l, accessType, notes: notes || undefined, amendedBy: user?.email ?? '' }
          : l,
      ),
    )
    setAmending(null)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-black text-neutral-900">Sign-In Book</h1>
        {canAmend && pendingCount > 0 && (
          <span
            className="rounded-full px-2.5 py-1 text-xs font-bold"
            style={{ backgroundColor: KBC.orange + '22', color: KBC.orange }}
          >
            {pendingCount} awaiting confirmation
          </span>
        )}
      </div>

      <div className="mb-3 flex gap-1.5">
        {(
          [
            ['recent', 'Last 30 Days'],
            ['archive', 'Archive'],
            ['mine', 'My Visits'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={[
              'flex-1 rounded-lg px-3 py-2 text-[13px] font-bold transition-colors',
              tab === id ? 'text-white' : 'bg-neutral-100 text-neutral-500',
            ].join(' ')}
            style={tab === id ? { backgroundColor: KBC.green } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="relative mb-4">
        <input
          className="kbc-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          aria-label="Search sign-ins by member name"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="absolute top-1/2 right-3 -translate-y-1/2 text-neutral-400"
          >
            ✕
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-neutral-400">Loading…</p>
      ) : days.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">
          {search ? 'No sign-ins match that name.' : 'No sign-ins recorded.'}
        </p>
      ) : (
        days.map((day) => (
          <section key={day.key} className="mb-5">
            <h2 className="mb-1.5 border-b border-neutral-200 pb-1 text-xs font-extrabold tracking-wide uppercase" style={{ color: KBC.pink }}>
              {formatDayHeader(day.key)}
            </h2>
            <ul>
              {day.entries.map((entry) => (
                <LogRow
                  key={entry.id}
                  entry={entry}
                  canAmend={canAmend}
                  canDelete={canDelete}
                  busy={busyId === entry.id}
                  onVerify={() => void handleVerify(entry)}
                  onDeny={() => confirmRemove(entry, 'Deny')}
                  onAmend={() => setAmending(entry)}
                  onDelete={() => confirmRemove(entry, 'Delete')}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {amending && (
        <AmendModal
          entry={amending}
          onClose={() => setAmending(null)}
          onSave={handleAmend}
        />
      )}
    </div>
  )
}

function LogRow({
  entry,
  canAmend,
  canDelete,
  busy,
  onVerify,
  onDeny,
  onAmend,
  onDelete,
}: {
  entry: LogEntry
  canAmend: boolean
  canDelete: boolean
  busy: boolean
  onVerify: () => void
  onDeny: () => void
  onAmend: () => void
  onDelete: () => void
}) {
  const color = ACCESS_COLORS[accessKind(entry.accessType)]
  const isPending = entry.status === 'pending'

  return (
    <li
      className="flex items-start gap-3 border-b border-neutral-100 py-2.5 last:border-b-0"
      style={isPending ? { backgroundColor: KBC.orange + '0d' } : undefined}
    >
      <span className="w-14 shrink-0 pt-0.5 text-[13px] font-semibold text-neutral-400 tabular-nums">
        {formatTime(entry.timestamp)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-neutral-900">{entry.userName}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ backgroundColor: color + '22', color }}
          >
            {entry.accessType}
          </span>
          {isPending && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{ backgroundColor: KBC.orange + '22', color: KBC.orange }}
            >
              Pending
            </span>
          )}
        </div>
        {entry.status === 'verified' && entry.verifiedBy && (
          <p className="mt-0.5 text-[11px] text-neutral-400">✓ verified by {entry.verifiedBy}</p>
        )}
        {entry.notes && <p className="mt-0.5 text-[12px] text-neutral-500">{entry.notes}</p>}
        {entry.amendedBy && <p className="mt-0.5 text-[11px] text-neutral-400">✏ amended</p>}
      </div>

      {isPending && canAmend ? (
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={onVerify}
            disabled={busy}
            aria-label={`Confirm ${entry.userName}'s sign-in`}
            className="rounded-lg px-2.5 py-1 text-sm font-bold text-white disabled:opacity-50"
            style={{ backgroundColor: KBC.green }}
          >
            ✓
          </button>
          <button
            type="button"
            onClick={onDeny}
            disabled={busy}
            aria-label={`Deny ${entry.userName}'s sign-in`}
            className="rounded-lg border px-2.5 py-1 text-sm font-bold disabled:opacity-50"
            style={{ borderColor: KBC.pink, color: KBC.pink }}
          >
            ✕
          </button>
        </div>
      ) : canAmend ? (
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={onAmend}
            disabled={busy}
            className="rounded-lg border border-neutral-300 px-2.5 py-1 text-[12px] font-semibold text-neutral-600 disabled:opacity-50"
          >
            Edit
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              aria-label={`Delete ${entry.userName}'s sign-in`}
              className="rounded-lg border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50"
              style={{ borderColor: KBC.pink, color: KBC.pink }}
            >
              🗑
            </button>
          )}
        </div>
      ) : null}
    </li>
  )
}

function AmendModal({
  entry,
  onClose,
  onSave,
}: {
  entry: LogEntry
  onClose: () => void
  onSave: (entry: LogEntry, accessType: string, notes: string) => Promise<void>
}) {
  const [accessType, setAccessType] = useState(entry.accessType)
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!accessType.trim()) return setErr('Access type cannot be empty.')
    setSaving(true)
    setErr(null)
    try {
      await onSave(entry, accessType.trim(), notes.trim())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save.')
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-black text-neutral-900">Amend sign-in</h2>
      <p className="mt-0.5 text-sm text-neutral-500">
        {entry.userName} · {new Date(entry.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </p>

      <label className="mt-4 mb-1 block text-[11px] font-bold tracking-wide text-neutral-500 uppercase">
        Access type
      </label>
      <input className="kbc-input" value={accessType} onChange={(e) => setAccessType(e.target.value)} />

      <label className="mt-3 mb-1 block text-[11px] font-bold tracking-wide text-neutral-500 uppercase">
        Notes
      </label>
      <input className="kbc-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />

      {err && <p className="mt-3 text-sm font-semibold text-red-600">{err}</p>}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-neutral-300 p-3 text-sm font-bold text-neutral-600"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex-1 rounded-xl p-3 text-sm font-extrabold text-black disabled:opacity-60"
          style={{ backgroundColor: KBC.cyan }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}
