import { useEffect, useState } from 'react'
import { MemberDetailModal } from '@/components/MemberDetailModal'
import { MemberHistoryModal, type HistoryKind } from '@/components/MemberHistoryModal'
import { ProfileEditModal } from '@/components/ProfileEditModal'
import { KBC } from '@/constants/theme'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { isAdmin } from '@/domain/roles'
import { accessPassLabel, isDatedPass } from '@/domain/membershipPass'
import { checkAndClearLapsedPass, getAllProfiles, updateProfile } from '@/services/profiles'
import type { AccessPassId, UserProfile } from '@/types/member'
import { formatShortDate } from '@/utils/datetime'

// The badge names the pass. Colour carries the confirmation state instead, so
// the two things the old membershipStatus conflated stay visibly separate.
const PASS_COLORS: Record<AccessPassId, string> = {
  annual: KBC.green, '8month': KBC.green, '4month': KBC.green, '1month': KBC.green,
  punch: KBC.cyan, dropin: KBC.cyan, none: '#aaa',
}

function formatDate(iso: string | null | undefined): string {
  return iso ? formatShortDate(iso) : '—'
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
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
  const [editing, setEditing] = useState<UserProfile | null>(null)
  const [editingProfile, setEditingProfile] = useState<UserProfile | null>(null)
  const [history, setHistory] = useState<{ member: UserProfile; kind: HistoryKind } | null>(null)

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
    await checkAndClearLapsedPass(freshDoc, user?.email ?? 'admin')
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
              <PassBadge pass={profile.membershipAccessPass} confirmed={profile.membershipConfirmed} />
              {viewerIsAdmin && <Tag color={KBC.purple}>ADMIN</Tag>}
              {profile.isSupervisor && !viewerIsAdmin && <Tag color={KBC.pink}>SUPER</Tag>}
            </div>
            {isDatedPass(profile.membershipAccessPass) && profile.membershipStart && (
              <p className="mt-2 text-xs text-neutral-500">
                {accessPassLabel(profile.membershipAccessPass)} · {formatDate(profile.membershipStart)} →{' '}
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
        <button
          type="button"
          onClick={() => setEditingProfile(profile)}
          className="mt-4 w-full rounded-xl border p-2.5 text-sm font-bold"
          style={{ borderColor: KBC.cyan, color: KBC.cyan }}
        >
          Edit My Profile
        </button>
      </div>

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
        </>
      ) : (
        <p className="text-sm text-neutral-500">Only supervisors and admins can view the full member list.</p>
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

function PassBadge({ pass, confirmed }: { pass: AccessPassId; confirmed: boolean }) {
  // An unconfirmed pass is shown as what was bought, marked pending — not as a
  // pass they hold, and not as the bare word "pending" either.
  const color = pass === 'none' || confirmed ? PASS_COLORS[pass] : KBC.orange
  return (
    <span
      className="shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold tracking-wide text-white"
      style={{ backgroundColor: color }}
    >
      {accessPassLabel(pass).toUpperCase()}
      {pass !== 'none' && !confirmed && ' · PENDING'}
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
