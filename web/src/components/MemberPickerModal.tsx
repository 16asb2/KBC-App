import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { KBC, tint } from '@/constants/theme'
import { getAllProfiles } from '@/services/profiles'
import type { UserProfile } from '@/types/member'

// Ported from mobile@1cdfada/app/(tabs)/home.tsx's OtherSignInModal — the sheet
// a supervisor uses to pick which climber they are signing in.

/** What this member could sign in with, at a glance, so you can spot a lapsed one. */
function accessSummary(m: UserProfile): { label: string; color: string } {
  if (m.membershipStatus === 'active') return { label: 'Active member', color: KBC.green }
  if (m.membershipStatus === 'pending') return { label: 'Pending', color: KBC.orange }
  if (m.punchPassRemaining > 0) {
    return {
      label: `${m.punchPassRemaining} punch${m.punchPassRemaining !== 1 ? 'es' : ''}`,
      color: KBC.cyan,
    }
  }
  return { label: 'No access', color: '#999' }
}

export function MemberPickerModal({
  title,
  excludeUid,
  onSelect,
  onClose,
}: {
  title: string
  /** Usually the signed-in supervisor — they have their own button for that. */
  excludeUid?: string
  onSelect: (member: UserProfile) => void
  onClose: () => void
}) {
  const [members, setMembers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    getAllProfiles()
      .then((all) => {
        if (!cancelled) setMembers(all)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load members.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members
      .filter((m) => m.uid !== excludeUid)
      .filter(
        (m) =>
          !q ||
          (m.preferredName ?? m.name).toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q),
      )
  }, [members, search, excludeUid])

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between pb-3">
        <h2 className="text-base font-bold text-black">{title}</h2>
        <button type="button" onClick={onClose} className="text-sm font-semibold" style={{ color: KBC.pink }}>
          Cancel
        </button>
      </div>

      <input
        className="kbc-input"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email…"
        autoFocus
      />

      {loading ? (
        <p className="py-8 text-center text-sm text-neutral-400">Loading members…</p>
      ) : error ? (
        <p className="py-8 text-center text-sm font-semibold text-red-600">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-400">No members found.</p>
      ) : (
        <ul className="mt-2 max-h-[45svh] divide-y divide-neutral-100 overflow-y-auto">
          {filtered.map((m) => {
            const access = accessSummary(m)
            return (
              <li key={m.uid}>
                <button
                  type="button"
                  onClick={() => onSelect(m)}
                  className="flex w-full items-center gap-3 py-2.5 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-neutral-900">
                      {m.preferredName || m.name}
                    </p>
                    <p className="truncate text-xs text-neutral-500">{m.email}</p>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold"
                    style={{ backgroundColor: tint(access.color), color: access.color }}
                  >
                    {access.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
