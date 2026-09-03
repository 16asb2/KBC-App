import { useEffect, useMemo, useState } from 'react'
import { MemberDetailModal } from '@/components/MemberDetailModal'
import { MemberHistoryModal, type HistoryKind } from '@/components/MemberHistoryModal'
import { PassBadge } from '@/components/PassBadge'
import { ProfileEditModal } from '@/components/ProfileEditModal'
import { KBC } from '@/constants/theme'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { isAdmin } from '@/domain/roles'
import { MEMBER_SORTS, type MemberSortId, sortMembers } from '@/domain/memberSort'
import { isDatedPass } from '@/domain/membershipPass'
import { checkAndClearLapsedPass, getAllProfiles, updateProfile } from '@/services/profiles'
import type { UserProfile } from '@/types/member'
import { formatShortDate } from '@/utils/datetime'
import { initials } from '@/utils/name'

function formatDate(iso: string | null | undefined): string {
  return iso ? formatShortDate(iso) : '—'
}

// Ported from mobile@1cdfada/app/(tabs)/members.tsx. MemberDetailModal covers
// membership and access; ProfileEditModal covers the rest of the record (names,
// contact, emergency contact, notes), and MemberHistoryModal shows a member's
// visits and purchases — mobile reached that through a /member-history/[uid]
// route, which is a modal here since this app has no navigation stack.
export function MembersPage() {
  const { user } = useAuth()
  const { profile, reloadProfile } = useProfile()

  const [allMembers, setAllMembers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<MemberSortId>('smart')
  const [editing, setEditing] = useState<UserProfile | null>(null)
  const [editingProfile, setEditingProfile] = useState<UserProfile | null>(null)
  const [history, setHistory] = useState<{ member: UserProfile; kind: HistoryKind } | null>(null)

  const viewerIsAdmin = isAdmin(user?.email, profile?.isAdmin)

  // No role check here: App.tsx only renders this route behind
  // RequireRole check={isPrivileged}, and firestore.rules is the real bound on
  // who may read the collection either way.
  useEffect(() => {
    loadMembers()
  }, [])

  async function loadMembers(): Promise<UserProfile[]> {
    setLoading(true)
    try {
      const members = await getAllProfiles()
      setAllMembers(members)
      return members
    } catch (e) {
      console.warn('Failed to load members:', e)
      return []
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(member: UserProfile, updates: Partial<UserProfile>) {
    await updateProfile(member.uid, updates, user?.email ?? '')
    const freshDoc = { ...member, ...updates } as UserProfile
    await checkAndClearLapsedPass(freshDoc, user?.email ?? 'admin')
    const fresh = await loadMembers()
    if (member.uid === profile?.uid) await reloadProfile()
    const freshMember = fresh.find((m) => m.uid === member.uid)
    if (freshMember) setEditing(freshMember)
  }

  // Both fields default to '' rather than being read straight off the record:
  // a document written by hand can be missing either, and one of them would
  // otherwise take out the whole directory (same reason getAllProfiles guards
  // its sort).
  const term = search.toLowerCase()
  // Smart Sort by default — the search results included, since the point of it
  // is that the person you are after is near the top before you have finished
  // typing. `getAllProfiles` hands this list back alphabetically; that order is
  // still one tap away under Name, and it is no longer what the screen opens on.
  const filtered = useMemo(
    () =>
      sortMembers(
        allMembers.filter(
          (m) =>
            (m.name ?? '').toLowerCase().includes(term) ||
            (m.email ?? '').toLowerCase().includes(term),
        ),
        sort,
      ),
    [allMembers, term, sort],
  )

  if (!profile) return null

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6 pb-16">
      {/* The directory, and only the directory. A member's own record used to
          sit in a card above this list, which meant it was reachable only by
          the people this route lets in — everybody else could not see their own
          profile at all. It lives on /profile now, for everyone. */}
      <h2 className="text-xs font-bold tracking-wide text-neutral-400 uppercase">All Members</h2>
      <input
        className="kbc-input"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email…"
      />
      {/* Smart Sort is the default and the leftmost option. The other two are
          here because it is a guess, however good — "who was in last" and plain
          alphabetical are both real questions, and a guessed order you cannot
          turn off is worse than no guess at all. */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-neutral-400">Sort</span>
        <div className="flex gap-1 rounded-full bg-neutral-100 p-1">
          {MEMBER_SORTS.map((option) => {
            const active = option.id === sort
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSort(option.id)}
                aria-pressed={active}
                className="rounded-full px-3 py-1 text-xs font-bold transition-colors"
                style={
                  active
                    ? { backgroundColor: KBC.pink, color: '#fff' }
                    : { color: '#737373' }
                }
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>
      {loading ? (
        <p className="pt-6 text-center text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-sm">
          {filtered.map((m) => (
            <button
              key={m.uid}
              type="button"
              onClick={() => setEditing(m)}
              className="flex w-full items-center gap-3 p-3.5 text-left"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-sm font-extrabold text-neutral-600">
                {initials(m.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-neutral-900">
                  {m.preferredName || m.name}
                  {m.isSupervisor && <span className="ml-1.5 text-xs font-bold" style={{ color: KBC.pink }}>(Super)</span>}
                </p>
                <p className="truncate text-xs text-neutral-500">
                  {isDatedPass(m.membershipAccessPass) && m.membershipExpiry
                    ? `Until ${formatDate(m.membershipExpiry)}`
                    : m.email}
                </p>
              </div>
              <PassBadge pass={m.membershipAccessPass} confirmed={m.membershipConfirmed} />
            </button>
          ))}
          {filtered.length === 0 && <p className="p-4 text-center text-sm text-neutral-400">No members found.</p>}
        </div>
      )}

      {editing && (
        <MemberDetailModal
          member={editing}
          canEditMembership={viewerIsAdmin}
          canDirectActivate={viewerIsAdmin}
          canEditSupervisor={viewerIsAdmin}
          onSave={(updates) => handleSave(editing, updates)}
          onEditProfile={viewerIsAdmin ? () => setEditingProfile(editing) : undefined}
          onViewHistory={(kind) => setHistory({ member: editing, kind })}
          onClose={() => setEditing(null)}
        />
      )}

      {editingProfile && (
        <ProfileEditModal
          profile={editingProfile}
          // Legal name is what the waivers were signed against, so only admins
          // may change it — including on their own record.
          canEditLegalName={viewerIsAdmin}
          onSave={(updates) => handleSave(editingProfile, updates)}
          onClose={() => setEditingProfile(null)}
        />
      )}

      {history && (
        <MemberHistoryModal
          uid={history.member.uid}
          memberName={history.member.preferredName || history.member.name}
          kind={history.kind}
          onClose={() => setHistory(null)}
        />
      )}
    </div>
  )
}
