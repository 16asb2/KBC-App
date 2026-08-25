import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { KBC } from '@/constants/theme'
import { SUPER_ADMIN_EMAIL, isAdmin } from '@/domain/roles'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { getAllProfiles, updateProfile } from '@/services/profiles'
import type { UserProfile } from '@/types/member'

function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// Ported from mobile@1cdfada/app/admin-management.tsx.
export function AdminManagementPage() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const [members, setMembers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const viewerIsAdmin = isAdmin(user?.email, profile?.isAdmin)

  useEffect(() => {
    if (!viewerIsAdmin) return
    getAllProfiles()
      .then(setMembers)
      .catch((e) => console.warn('Failed to load members:', e))
      .finally(() => setLoading(false))
  }, [viewerIsAdmin])

  if (!viewerIsAdmin) return <Navigate to="/home" replace />

  async function toggleAdmin(member: UserProfile) {
    if (!user?.email) return
    if (member.uid === profile?.uid) return
    if (member.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) return

    const newValue = !member.isAdmin
    const name = member.preferredName || member.name
    const confirmed = window.confirm(
      newValue
        ? `Give ${name} full admin access? They will be able to manage members, supervisors, and other admins.`
        : `Remove admin access from ${name}?`,
    )
    if (!confirmed) return

    setError(null)
    setSaving(member.uid)
    try {
      await updateProfile(member.uid, { isAdmin: newValue }, user.email)
      setMembers((prev) => prev.map((m) => (m.uid === member.uid ? { ...m, isAdmin: newValue } : m)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6 pb-16">
      <h1 className="text-xl font-extrabold text-black">Admin Management</h1>

      <div className="space-y-1.5 rounded-xl border p-4" style={{ backgroundColor: `${KBC.purple}18`, borderColor: `${KBC.purple}44` }}>
        <p className="text-sm font-extrabold" style={{ color: KBC.purple }}>
          🔑 Admin Accounts
        </p>
        <p className="text-[13px] leading-5 text-neutral-600">
          Admins can manage memberships, grant supervisor status, and manage other admins. The super-admin
          account ({SUPER_ADMIN_EMAIL}) cannot be modified.
        </p>
      </div>

      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

      {loading ? (
        <p className="pt-8 text-center text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-sm">
          {members.map((member) => {
            const isSelf = member.uid === profile?.uid
            const isSuperAdmin = member.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()
            const isLocked = isSelf || isSuperAdmin
            const hasAdmin = isAdmin(member.email, member.isAdmin)
            const displayName = member.preferredName || member.name
            const isSavingThis = saving === member.uid

            return (
              <div key={member.uid} className="flex items-center gap-3 p-3.5">
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white"
                  style={{ backgroundColor: KBC.purple }}
                >
                  {initials(displayName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[15px] font-bold text-neutral-900">{displayName}</span>
                    {isSuperAdmin && <Tag color={KBC.purple}>SUPER</Tag>}
                    {isSelf && <Tag color="#555">YOU</Tag>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-neutral-500">{member.email}</p>
                </div>
                {isSavingThis ? (
                  <span className="text-xs text-neutral-400">Saving…</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => !isLocked && void toggleAdmin(member)}
                    disabled={isLocked}
                    className="rounded-full border px-3 py-1.5 text-xs font-bold disabled:opacity-35"
                    style={
                      hasAdmin
                        ? { backgroundColor: `${KBC.purple}22`, borderColor: KBC.purple, color: KBC.purple }
                        : { backgroundColor: '#f8f8f8', borderColor: '#ddd', color: '#aaa' }
                    }
                  >
                    {hasAdmin ? 'Admin ✓' : 'Admin'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-white"
      style={{ backgroundColor: color }}
    >
      {children}
    </span>
  )
}
