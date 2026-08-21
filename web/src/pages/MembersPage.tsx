import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MemberDetailModal } from '@/components/MemberDetailModal'
import { KBC } from '@/constants/theme'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { isAdmin } from '@/domain/roles'
import { getPassLabel } from '@/domain/membershipPass'
import { checkAndUpdateMembershipStatus, getAllProfiles, updateProfile } from '@/services/profiles'
import type { MembershipStatus, UserProfile } from '@/types/member'

const STATUS_LABELS: Record<MembershipStatus, string> = { active: 'Active', pending: 'Pending', inactive: 'Inactive' }
const STATUS_COLORS: Record<MembershipStatus, string> = { active: KBC.green, pending: KBC.orange, inactive: '#aaa' }

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

// Ported from mobile/app/(tabs)/members.tsx, scoped down — see
// components/MemberDetailModal.tsx for what's deferred. "Edit My Profile" for
// the signed-in user's own card isn't ported either (same ProfileEditModal gap).
export function MembersPage() {
  const { user } = useAuth()
  const { profile, reloadProfile } = useProfile()

  const [allMembers, setAllMembers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<UserProfile | null>(null)

  const viewerIsAdmin = isAdmin(user?.email, profile?.isAdmin)
  const viewerIsSupervisor = profile?.isSupervisor ?? false
  const canSeeAllMembers = viewerIsAdmin || viewerIsSupervisor

  useEffect(() => {
    if (!canSeeAllMembers) return
    loadMembers()
  }, [canSeeAllMembers])

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
    await checkAndUpdateMembershipStatus(freshDoc, user?.email ?? 'admin')
    const fresh = await loadMembers()
    if (member.uid === profile?.uid) await reloadProfile()
    const freshMember = fresh.find((m) => m.uid === member.uid)
    if (freshMember) setEditing(freshMember)
  }

  const filtered = allMembers.filter(
    (m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase()),
  )

  if (!profile) return null

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6 pb-16">
      {/* Own profile card */}
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div
            className="flex size-16 shrink-0 items-center justify-center rounded-full text-lg font-extrabold text-white"
            style={{ backgroundColor: KBC.pink }}
          >
            {initials(profile.preferredName || profile.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-black">{profile.preferredName || profile.name}</p>
            {profile.isSupervisor && <p className="-mt-0.5 text-xs font-bold" style={{ color: KBC.pink }}>Supervisor</p>}
            {profile.preferredName && <p className="text-xs text-neutral-500">{profile.name}</p>}
            <p className="mt-1 text-sm text-neutral-500">{profile.preferredEmail || profile.email}</p>
            {profile.phone && <p className="text-sm text-neutral-500">📞 {profile.phone}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge status={profile.membershipStatus} />
              {viewerIsAdmin && <Tag color={KBC.purple}>ADMIN</Tag>}
              {profile.isSupervisor && !viewerIsAdmin && <Tag color={KBC.pink}>SUPER</Tag>}
            </div>
            {(profile.membershipStatus === 'active' || profile.membershipStatus === 'pending') && profile.membershipStart && (
              <p className="mt-2 text-xs text-neutral-500">
                {getPassLabel(profile.membershipStart, profile.membershipExpiry)} · {formatDate(profile.membershipStart)} →{' '}
                {formatDate(profile.membershipExpiry)}
              </p>
            )}
            {profile.punchPassRemaining > 0 && (
              <p className="mt-1 text-xs text-neutral-500">
                🎟 {profile.punchPassRemaining} punch{profile.punchPassRemaining !== 1 ? 'es' : ''} remaining
              </p>
            )}
            <p className="mt-1 text-xs text-neutral-400">Member since {formatDate(profile.memberSince)}</p>
          </div>
        </div>
      </div>

      {viewerIsAdmin && (
        <Link
          to="/admin-management"
          className="block rounded-2xl border p-3.5 text-center text-sm font-bold"
          style={{ borderColor: KBC.purple, color: KBC.purple }}
        >
          🔑 Manage Admins
        </Link>
      )}

      {/* Members list */}
      {canSeeAllMembers ? (
        <>
          <h2 className="text-xs font-bold tracking-wide text-neutral-400 uppercase">All Members</h2>
          <input
            className="kbc-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
          />
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
                      {(m.membershipStatus === 'active' || m.membershipStatus === 'pending') && m.membershipExpiry
                        ? `Until ${formatDate(m.membershipExpiry)}`
                        : m.email}
                    </p>
                  </div>
                  <StatusBadge status={m.membershipStatus} />
                </button>
              ))}
              {filtered.length === 0 && <p className="p-4 text-center text-sm text-neutral-400">No members found.</p>}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-neutral-500">Only supervisors and admins can view the full member list.</p>
      )}

      {editing && (
        <MemberDetailModal
          member={editing}
          canEditMembership={viewerIsAdmin || viewerIsSupervisor}
          canDirectActivate={viewerIsAdmin}
          canEditSupervisor={viewerIsAdmin}
          onSave={(updates) => handleSave(editing, updates)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: MembershipStatus }) {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold tracking-wide text-white"
      style={{ backgroundColor: STATUS_COLORS[status] }}
    >
      {STATUS_LABELS[status].toUpperCase()}
    </span>
  )
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-white" style={{ backgroundColor: color }}>
      {children}
    </span>
  )
}
