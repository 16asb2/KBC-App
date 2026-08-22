import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AccessModal } from '@/components/AccessModal'
import { Modal } from '@/components/Modal'
import { NewMemberModal } from '@/components/NewMemberModal'
import { KBC } from '@/constants/theme'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { useSchedule } from '@/context/ScheduleContext'
import { hasSignedInToday, passLabel } from '@/domain/signIn'
import { isPrivileged } from '@/domain/roles'
import { getGymStatusFromEvents, type GymStatus } from '@/domain/calendarEvent'
import { addLogEntry, setGymOpen, type AccessOption } from '@/services/logbook'
import { updateProfile } from '@/services/profiles'
import type { UserProfile } from '@/types/member'

// Ported from mobile/app/(tabs)/home.tsx — self sign-in, purchase access, and
// (as of this pass) adding a new member are covered. Still not ported: signing
// another *existing* climber in and punch donation between members.
export function HomePage() {
  const { user } = useAuth()
  const { profile, reloadProfile } = useProfile()
  const { allEvents } = useSchedule()
  const navigate = useNavigate()

  const gymStatus: GymStatus = getGymStatusFromEvents(allEvents)
  const [signingIn, setSigningIn] = useState(false)
  const [showAccess, setShowAccess] = useState(false)
  const [showPunchChoice, setShowPunchChoice] = useState(false)
  const [showNewMember, setShowNewMember] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  if (!profile || !user) return null

  const privileged = isPrivileged(user.email, profile)
  const displayName = profile.preferredName || user.displayName || user.email || 'Unknown'

  async function logAndMarkSignedIn(accessType: string) {
    const now = new Date().toISOString()
    const pendingStatus = privileged ? undefined : ('pending' as const)
    await addLogEntry({
      timestamp: now,
      userId: profile!.uid,
      userName: displayName,
      accessType,
      ...(pendingStatus ? { status: pendingStatus } : {}),
    })
    if (profile!.isSupervisor) setGymOpen(displayName).catch(() => {})
    return now
  }

  async function handleSignIn() {
    if (!profile || !user) return

    if (hasSignedInToday(profile.lastSignInAt)) {
      setToast('You have already signed in today. Sign-ins reset at midnight.')
      return
    }

    if (profile.membershipStatus === 'active' || profile.membershipStatus === 'pending') {
      setSigningIn(true)
      try {
        const label = passLabel(profile.membershipStart, profile.membershipExpiry)
        const now = await logAndMarkSignedIn(label)
        await updateProfile(profile.uid, { lastSignInAt: now }, user.email ?? 'unknown')
        await reloadProfile()
        setToast('✓ Signed in! Session logged.')
      } catch (e) {
        setToast(e instanceof Error ? e.message : 'Something went wrong.')
      } finally {
        setSigningIn(false)
      }
      return
    }

    if (profile.punchPassRemaining > 0) {
      setShowPunchChoice(true)
      return
    }

    setShowAccess(true)
  }

  async function signInWithPunchPass() {
    if (!profile || !user) return
    setShowPunchChoice(false)
    setSigningIn(true)
    try {
      const remaining = profile.punchPassRemaining - 1
      const now = await logAndMarkSignedIn(`Punch Pass (${remaining} left)`)
      await updateProfile(profile.uid, { punchPassRemaining: remaining, lastSignInAt: now }, user.email ?? 'unknown')
      await reloadProfile()
      setToast(`✓ Signed in! ${remaining} punch${remaining !== 1 ? 'es' : ''} remaining.`)
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSigningIn(false)
    }
  }

  async function handleAccessSelected(option: AccessOption, voucherCode?: string) {
    if (!profile || !user) return
    setShowAccess(false)
    setSigningIn(true)

    try {
      const now = new Date()
      const profileUpdates: Partial<UserProfile> = {}
      let accessType = ''
      let notes = `Purchased: ${option.label} ${option.price}`

      if (option.id === 'dropin') {
        accessType = 'Drop-In'
      } else if (option.punches) {
        const total = option.punches
        const remaining = total - 1
        profileUpdates.punchPassRemaining = remaining
        profileUpdates.pendingPunches = total // admin confirmation required
        accessType = `Punch Pass (${remaining} left)`
        notes += ` — ${total} punches added, 1 used`
      } else if (option.months) {
        const expiry = new Date(now)
        expiry.setMonth(expiry.getMonth() + option.months)
        profileUpdates.membershipStatus = 'pending'
        profileUpdates.membershipStart = now.toISOString()
        profileUpdates.membershipExpiry = expiry.toISOString()
        profileUpdates.pendingMembership = JSON.stringify({
          label: option.label,
          price: option.price,
          start: now.toISOString(),
          expiry: expiry.toISOString(),
        })
        accessType = 'Active Member'
        notes += ` — expires ${expiry.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`
      } else if (option.isVoucher) {
        accessType = 'Voucher'
        notes = voucherCode ? `Voucher code: ${voucherCode}` : 'Voucher'
      }

      profileUpdates.lastSignInAt = now.toISOString()
      await updateProfile(profile.uid, profileUpdates, user.email ?? 'unknown')
      await reloadProfile()

      // Purchase record (Access Pass History)
      await addLogEntry({ timestamp: now.toISOString(), userId: profile.uid, userName: displayName, accessType, notes })
      // Sign-in record (Sign-In History) — every purchase also signs the member in
      await addLogEntry({
        timestamp: new Date(now.getTime() + 1).toISOString(),
        userId: profile.uid,
        userName: displayName,
        accessType,
        ...(privileged ? {} : { status: 'pending' as const }),
      })

      setToast('✓ Signed in! Session logged.')
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6 pb-16">
      {toast && (
        <div className="fixed inset-x-4 top-4 z-50 rounded-xl bg-black px-4 py-3 text-center text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="text-center">
        <h1 className="text-2xl font-extrabold text-black">Welcome to the KBC App!</h1>
        <p className="mt-1 text-sm text-neutral-500">Created by climbers, for climbers 🧗</p>
      </div>

      <GymStatusCard status={gymStatus} />

      <button
        type="button"
        onClick={() => void handleSignIn()}
        disabled={signingIn}
        className="w-full rounded-2xl p-5 text-lg font-extrabold text-white shadow-lg disabled:opacity-60"
        style={{ backgroundColor: KBC.pink }}
      >
        {signingIn ? 'Signing in…' : 'Sign In to a Session'}
      </button>

      {privileged && (
        <button
          type="button"
          onClick={() => setShowNewMember(true)}
          className="w-full rounded-2xl border p-4 text-base font-bold"
          style={{ borderColor: KBC.orange, color: KBC.orange }}
        >
          Add New Member
        </button>
      )}

      {showAccess && <AccessModal onComplete={(opt, code) => void handleAccessSelected(opt, code)} onClose={() => setShowAccess(false)} />}

      {showNewMember && (
        <NewMemberModal
          createdByEmail={user.email ?? ''}
          onCreated={(member) => {
            setShowNewMember(false)
            const targetName = member.legalName || member.name
            navigate(
              `/waiver/liability?targetUid=${encodeURIComponent(member.uid)}&targetName=${encodeURIComponent(targetName)}`,
            )
          }}
          onClose={() => setShowNewMember(false)}
        />
      )}

      {showPunchChoice && (
        <Modal onClose={() => setShowPunchChoice(false)}>
          <h2 className="text-base font-bold text-black">Sign In</h2>
          <p className="mt-1 text-sm text-neutral-600">
            You have {profile.punchPassRemaining} punch{profile.punchPassRemaining !== 1 ? 'es' : ''} remaining.
          </p>
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => void signInWithPunchPass()}
              className="w-full rounded-xl p-3 font-bold text-white"
              style={{ backgroundColor: KBC.cyan }}
            >
              Use Punch Pass
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPunchChoice(false)
                setShowAccess(true)
              }}
              className="w-full rounded-xl border p-3 font-bold"
              style={{ borderColor: KBC.pink, color: KBC.pink }}
            >
              Buy Access Pass
            </button>
            <button
              type="button"
              onClick={() => setShowPunchChoice(false)}
              className="w-full rounded-xl p-3 font-semibold text-neutral-500"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function formatTime(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

function formatDateTime(date: Date): string {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const label = sameDay(date, today) ? 'Today' : sameDay(date, tomorrow) ? 'Tomorrow' : date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
  return `${label} at ${formatTime(date)}`
}

function GymStatusCard({ status }: { status: GymStatus }) {
  return (
    <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: KBC.black }}>
      <span
        className="inline-block rounded-full px-3 py-1 text-xs font-extrabold text-white"
        style={{ backgroundColor: status.open ? KBC.green : KBC.darkGrey }}
      >
        {status.open ? 'OPEN NOW' : 'CLOSED'}
      </span>
      {status.open ? (
        <>
          <p className="mt-3 text-lg font-bold text-white">The gym is open!</p>
          <p className="mt-1 text-sm text-neutral-400">
            {status.supervisorName ? `Supervisor: ${status.supervisorName}` : 'Come climb!'} · until {formatTime(status.until)}
          </p>
        </>
      ) : status.next ? (
        <>
          <p className="mt-3 text-lg font-bold text-white">Gym is closed right now.</p>
          <p className="mt-1 text-sm text-neutral-400">
            Next session opens <span className="font-semibold text-white">{formatDateTime(status.next)}</span>.
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 text-lg font-bold text-white">Gym is closed.</p>
          <p className="mt-1 text-sm text-neutral-400">No upcoming sessions scheduled. Check back soon!</p>
        </>
      )}
    </div>
  )
}
