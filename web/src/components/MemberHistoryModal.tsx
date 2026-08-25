import { useEffect, useState } from 'react'
import { Modal } from '@/components/Modal'
import { KBC, tint } from '@/constants/theme'
import { accessKind, isPurchaseEntry } from '@/domain/signInBook'
import { getUserLogs, type LogEntry } from '@/services/logbook'
import { formatShortDate, formatTime } from '@/utils/datetime'

// Ported from mobile@1cdfada/app/member-history/[uid].tsx. That was a route; here it is
// a modal opened from the member detail sheet, since the web app reaches member
// records through MembersPage rather than a navigation stack.
//
// Both views read the same `logs` collection: buying access writes an entry
// whose notes start with "Purchased:", attending writes one that doesn't.

const ACCESS_COLORS: Record<ReturnType<typeof accessKind>, string> = {
  member: KBC.green,
  punch: KBC.cyan,
  dropin: KBC.purple,
  other: '#888',
}

export type HistoryKind = 'signins' | 'purchases'

export function MemberHistoryModal({
  uid,
  memberName,
  kind,
  onClose,
}: {
  uid: string
  memberName: string
  kind: HistoryKind
  onClose: () => void
}) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getUserLogs(uid)
      .then((logs) => {
        if (cancelled) return
        setEntries(logs.filter((l) => (kind === 'purchases' ? isPurchaseEntry(l) : !isPurchaseEntry(l))))
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Could not load this history.')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [uid, kind])

  const title = kind === 'purchases' ? 'Access pass history' : 'Sign-in history'

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-black text-neutral-900">{title}</h2>
      <p className="mt-0.5 text-sm text-neutral-500">{memberName}</p>

      {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}

      {loading ? (
        <p className="py-10 text-center text-sm text-neutral-400">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">No records found.</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-neutral-100">
            {entries.map((e) => {
              const color = ACCESS_COLORS[accessKind(e.accessType)]
              return (
                <li key={e.id} className="flex items-start gap-3 py-2.5">
                  <div className="w-24 shrink-0">
                    <p className="text-[13px] font-semibold text-neutral-700">{formatShortDate(e.timestamp)}</p>
                    <p className="text-[11px] text-neutral-400">{formatTime(e.timestamp)}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{ backgroundColor: tint(color), color }}
                    >
                      {e.accessType}
                    </span>
                    {e.status === 'pending' && (
                      <span
                        className="ml-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold"
                        style={{ backgroundColor: tint(KBC.orange), color: KBC.orange }}
                      >
                        Pending
                      </span>
                    )}
                    {e.notes && <p className="mt-0.5 text-[12px] text-neutral-500">{e.notes}</p>}
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-center text-xs text-neutral-400">
            {entries.length} record{entries.length !== 1 ? 's' : ''}
          </p>
        </>
      )}

      <button
        type="button"
        onClick={onClose}
        className="mt-5 w-full rounded-xl border border-neutral-300 p-3 text-sm font-bold text-neutral-600"
      >
        Close
      </button>
    </Modal>
  )
}
