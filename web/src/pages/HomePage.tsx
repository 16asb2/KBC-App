import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AccessModal } from '@/components/AccessModal'
import { ConnectWithKBC } from '@/components/ConnectWithKBC'
import { Modal } from '@/components/Modal'
import { MemberPickerModal } from '@/components/MemberPickerModal'
import { NewMemberModal } from '@/components/NewMemberModal'
import { KBC } from '@/constants/theme'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { useSchedule } from '@/context/ScheduleContext'
import { hasSignedInToday, passLabel } from '@/domain/signIn'
import { isPrivileged } from '@/domain/roles'
import { getGymStatusFromEvents, type GymStatus } from '@/domain/calendarEvent'
import {
  addLogEntry,
  getPendingSignInCount,
  setGymOpen,
  type AccessOption,
} from '@/services/logbook'
import { updateProfile } from '@/services/profiles'
import type { UserProfile } from '@/types/member'
import { formatShortDate } from '@/utils/datetime'

/**
 * Who a sign-in is for.
 *
 * `isSelf` is not just `profile.uid === target.uid` bookkeeping: it decides
 * whether to reload the viewer's own profile afterwards, and whether the
 * confirmation reads "Signed in!" or "Jane signed in!".
 */
type SignInTarget = { profile: UserProfile; isSelf: boolean }

// Ported from mobile@1cdfada/app/(tabs)/home.tsx — self sign-in, signing in
// another climber, purchase access and adding a new member are covered. Still
// not ported: punch donation between members.
export function HomePage() {
  const { user } = useAuth()
  const { profile, reloadProfile } = useProfile()
  const { allEvents } = useSchedule()
  const navigate = useNavigate()

  const gymStatus: GymStatus = getGymStatusFromEvents(allEvents)
  const [signingIn, setSigningIn] = useState(false)
  const [showAccess, setShowAccess] = useState(false)
  // Who a sign-in is *for*. A supervisor can sign in another climber, so every
  // step of the flow below carries its target rather than assuming the viewer.
  const [punchChoice, setPunchChoice] = useState<SignInTarget | null>(null)
  const [pickingMember, setPickingMember] = useState(false)
  const [accessTarget, setAccessTarget] = useState<SignInTarget | null>(null)
  /** Who is being signed in while we ask whose punch pays for it. */
  const [donorFor, setDonorFor] = useState<SignInTarget | null>(null)
  const [showNewMember, setShowNewMember] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [pendingSignIns, setPendingSignIns] = useState(0)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    // Only supervisors and admins can act on pending sign-ins, so the read
    // isn't spent for anyone else. Failing here is not worth surfacing — the
    // badge just doesn't appear, and the Sign-In Book itself still works.
    if (!user || !isPrivileged(user.email, profile)) return
    getPendingSignInCount()
      .then(setPendingSignIns)
      .catch((e) => console.warn('[Home] Pending sign-in count failed:', e))
  }, [user, profile])

  if (!profile || !user) return null

  const privileged = isPrivileged(user.email, profile)
  const displayName = profile.preferredName || user.displayName || user.email || 'Unknown'

  function nameOf(target: SignInTarget) {
    return target.isSelf ? displayName : target.profile.preferredName || target.profile.name
  }

  /** "Signed in!" for yourself, "Jane signed in!" for anyone else. */
  function signedInMessage(target: SignInTarget, detail: string) {
    return target.isSelf ? `✓ Signed in! ${detail}` : `✓ ${nameOf(target)} signed in! ${detail}`
  }

  async function logAndMarkSignedIn(target: SignInTarget, accessType: string) {
    const now = new Date().toISOString()
    // Whether an entry needs confirming depends on who is *doing* the sign-in,
    // not who it is for: a supervisor signing a member in has already vouched
    // for them, so it lands confirmed.
    const pendingStatus = privileged ? undefined : ('pending' as const)
    await addLogEntry({
      timestamp: now,
      userId: target.profile.uid,
      userName: nameOf(target),
      accessType,
      ...(pendingStatus ? { status: pendingStatus } : {}),
    })
    if (target.profile.isSupervisor) setGymOpen(nameOf(target)).catch(() => {})
    return now
  }

  /**
   * Sign `target` in, taking whichever route their access allows.
   *
   * Reloads the viewer's own profile only when the target *is* the viewer —
   * signing someone else in must not overwrite what is on screen.
   */
  async function processSignIn(target: SignInTarget) {
    if (!profile || !user) return

    if (hasSignedInToday(target.profile.lastSignInAt)) {
      setToast(
        target.isSelf
          ? 'You have already signed in today. Sign-ins reset at midnight.'
          : `${nameOf(target)} has already signed in today. Sign-ins reset at midnight.`,
      )
      return
    }

    const { membershipStatus, punchPassRemaining } = target.profile

    if (membershipStatus === 'active' || membershipStatus === 'pending') {
      setSigningIn(true)
      try {
        const label = passLabel(target.profile.membershipStart, target.profile.membershipExpiry)
        const now = await logAndMarkSignedIn(target, label)
        await updateProfile(target.profile.uid, { lastSignInAt: now }, user.email ?? 'unknown')
        if (target.isSelf) await reloadProfile()
        setToast(signedInMessage(target, 'Session logged.'))
      } catch (e) {
        setToast(e instanceof Error ? e.message : 'Something went wrong.')
      } finally {
        setSigningIn(false)
      }
      return
    }

    if (punchPassRemaining > 0) {
      setPunchChoice(target)
      return
    }

    setAccessTarget(target)
    setShowAccess(true)
  }

  /**
   * The blue button: always signs *you* in, whoever you are.
   *
   * Signing another climber in used to be an interstitial on this button —
   * supervisors were asked "you or someone else?" every single time, taxing the
   * common case to reach the rare one. It has its own button now.
   */
  function handleSignIn() {
    if (!profile || !user) return
    void processSignIn({ profile, isSelf: true })
  }

  async function signInWithPunchPass(target: SignInTarget) {
    if (!profile || !user) return
    setPunchChoice(null)
    setSigningIn(true)
    try {
      const remaining = target.profile.punchPassRemaining - 1
      const now = await logAndMarkSignedIn(target, `Punch Pass (${remaining} left)`)
      await updateProfile(
        target.profile.uid,
        { punchPassRemaining: remaining, lastSignInAt: now },
        user.email ?? 'unknown',
      )
      if (target.isSelf) await reloadProfile()
      setToast(
        signedInMessage(target, `${remaining} punch${remaining !== 1 ? 'es' : ''} remaining.`),
      )
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSigningIn(false)
    }
  }

  /**
   * Sign `target` in on a punch from `donor`'s account.
   *
   * Two profile writes, so it is supervisor-only in practice as well as by
   * intent: firestore.rules lets you update `users/{uid}` for yourself or as a
   * supervisor, and this touches two different people.
   */
  async function signInWithDonatedPunch(target: SignInTarget, donor: UserProfile) {
    if (!profile || !user) return
    const donorName = donor.preferredName || donor.name
    if (donor.punchPassRemaining < 1) {
      setToast(`${donorName} has no punch passes remaining.`)
      return
    }
    if (hasSignedInToday(target.profile.lastSignInAt)) {
      setToast(
        target.isSelf
          ? 'You have already signed in today. Sign-ins reset at midnight.'
          : `${nameOf(target)} has already signed in today. Sign-ins reset at midnight.`,
      )
      return
    }

    setSigningIn(true)
    try {
      const now = new Date().toISOString()
      const donorLeft = donor.punchPassRemaining - 1
      const pendingStatus = privileged ? undefined : ('pending' as const)

      await updateProfile(donor.uid, { punchPassRemaining: donorLeft }, user.email ?? 'unknown')
      await updateProfile(target.profile.uid, { lastSignInAt: now }, user.email ?? 'unknown')
      await addLogEntry({
        timestamp: now,
        userId: target.profile.uid,
        userName: nameOf(target),
        accessType: `Punch Pass (from ${donorName})`,
        notes: `Punch donated by ${donorName} — ${donorLeft} punch${donorLeft !== 1 ? 'es' : ''} remaining on their account`,
        ...(pendingStatus ? { status: pendingStatus } : {}),
      })

      // Reload if either side of the donation is the viewer: the recipient's
      // lastSignInAt or the donor's punch count is now on screen and stale.
      if (target.isSelf || donor.uid === profile.uid) await reloadProfile()
      setToast(
        `✓ ${target.isSelf ? 'Signed in' : `${nameOf(target)} signed in`} using ${donorName}'s punch — ${donorLeft} left on their account.`,
      )
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSigningIn(false)
    }
  }

  async function handleAccessSelected(option: AccessOption, voucherCode?: string) {
    if (!profile || !user) return
    const target = accessTarget ?? { profile, isSelf: true }
    setShowAccess(false)
    setAccessTarget(null)
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
        // The pass they actually bought — "Active Member" threw that away, and
        // said "active" of a purchase still waiting on admin confirmation.
        accessType = option.label
        notes += ` — expires ${formatShortDate(expiry)}`
      } else if (option.isVoucher) {
        accessType = 'Voucher'
        notes = voucherCode ? `Voucher code: ${voucherCode}` : 'Voucher'
      }

      profileUpdates.lastSignInAt = now.toISOString()
      await updateProfile(target.profile.uid, profileUpdates, user.email ?? 'unknown')
      if (target.isSelf) await reloadProfile()

      // Purchase record (Access Pass History)
      await addLogEntry({
        timestamp: now.toISOString(),
        userId: target.profile.uid,
        userName: nameOf(target),
        accessType,
        notes,
      })
      // Sign-in record (Sign-In History) — every purchase also signs the member in
      await addLogEntry({
        timestamp: new Date(now.getTime() + 1).toISOString(),
        userId: target.profile.uid,
        userName: nameOf(target),
        accessType,
        ...(privileged ? {} : { status: 'pending' as const }),
      })

      setToast(signedInMessage(target, 'Session logged.'))
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

      {/* One stack, tight: the actions belong together, so they share a size,
          a weight and a 8px gap rather than floating apart at the page's
          6-unit rhythm.

          Colour splits it by audience rather than by kind: blue is what every
          member uses on every visit, orange is the supervisor's desk work. So
          a member sees two blue buttons and nothing else, and a supervisor
          reads the orange pair as a group without having to think about it. */}
      <div className="space-y-2">
        <HomeAction
          as="button"
          onClick={() => void handleSignIn()}
          disabled={signingIn}
          color={KBC.cyan}
        >
          {signingIn ? 'Signing in…' : 'Sign In to a Session'}
        </HomeAction>

        {/* The sign-in book isn't a tab — the bottom bar is already six items
            wide on a phone. Everyone gets here for "My Visits"; supervisors
            also confirm pending sign-ins here, so the count is surfaced on the
            button rather than making them open it to discover work waiting.
            It sits absolutely to the right so it never pulls the label off
            centre — these buttons have to line up with each other. */}
        <HomeAction as="link" to="/logbook" color={KBC.cyan}>
          Sign-In Book
          {privileged && pendingSignIns > 0 && (
            <span
              className="absolute right-4 flex size-6 items-center justify-center rounded-full bg-white text-xs font-extrabold"
              style={{ color: KBC.orange }}
              title={`${pendingSignIns} sign-in${pendingSignIns !== 1 ? 's' : ''} awaiting confirmation`}
            >
              {pendingSignIns}
            </span>
          )}
        </HomeAction>

        {privileged && (
          <HomeAction
            as="button"
            onClick={() => setPickingMember(true)}
            color={KBC.orange}
            textColor="#fff"
          >
            Sign In Another Climber
          </HomeAction>
        )}

        {privileged && (
          <HomeAction
            as="button"
            onClick={() => setShowNewMember(true)}
            color={KBC.orange}
            textColor="#fff"
          >
            Add New Member
          </HomeAction>
        )}
      </div>

      <ConnectWithKBC />

      {showAccess && (
        <AccessModal
          onComplete={(opt, code) => void handleAccessSelected(opt, code)}
          onUseOtherPunch={
            privileged
              ? () => {
                  const target = accessTarget ?? { profile, isSelf: true }
                  setShowAccess(false)
                  setAccessTarget(null)
                  setDonorFor(target)
                }
              : undefined
          }
          onClose={() => {
            setShowAccess(false)
            setAccessTarget(null)
          }}
        />
      )}

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

      {donorFor && (
        <MemberPickerModal
          title="Select Punch Donor"
          // Not the person being signed in — spending your own punch on
          // yourself is the ordinary punch flow, not a donation.
          excludeUid={donorFor.profile.uid}
          filter={(m) => m.punchPassRemaining > 0}
          emptyLabel="No other member has a punch left to give."
          badgeFor={(m) => ({
            label: `${m.punchPassRemaining} punch${m.punchPassRemaining !== 1 ? 'es' : ''}`,
            color: KBC.cyan,
          })}
          onSelect={(donor) => {
            const target = donorFor
            setDonorFor(null)
            void signInWithDonatedPunch(target, donor)
          }}
          onClose={() => setDonorFor(null)}
        />
      )}

      {pickingMember && (
        <MemberPickerModal
          title="Sign In Another Climber"
          excludeUid={profile.uid}
          onSelect={(member) => {
            setPickingMember(false)
            void processSignIn({ profile: member, isSelf: false })
          }}
          onClose={() => setPickingMember(false)}
        />
      )}

      {punchChoice && (
        <Modal onClose={() => setPunchChoice(null)}>
          <h2 className="text-base font-bold text-black">Sign In</h2>
          <p className="mt-1 text-sm text-neutral-600">
            {punchChoice.isSelf ? 'You have' : `${nameOf(punchChoice)} has`}{' '}
            {punchChoice.profile.punchPassRemaining} punch
            {punchChoice.profile.punchPassRemaining !== 1 ? 'es' : ''} remaining.
          </p>
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => void signInWithPunchPass(punchChoice)}
              className="w-full rounded-xl p-3 font-bold text-white"
              style={{ backgroundColor: KBC.cyan }}
            >
              Use Punch Pass
            </button>
            <button
              type="button"
              onClick={() => {
                setAccessTarget(punchChoice)
                setPunchChoice(null)
                setShowAccess(true)
              }}
              className="w-full rounded-xl border p-3 font-bold"
              style={{ borderColor: KBC.pink, color: KBC.pink }}
            >
              Buy Access Pass
            </button>
            <button
              type="button"
              onClick={() => setPunchChoice(null)}
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

/**
 * The three actions on this screen, so their size, weight and shape can only
 * ever be set in one place. They read as a set, which they didn't when each
 * carried its own padding and font size.
 *
 * White text throughout. That only works because KBC cyan is now the logo's
 * blue rather than the lighter `#00b4d8` it used to be — white on the old
 * value was 2.5:1 and failed WCAG AA outright, where on this one it is 4.6:1.
 */
function HomeAction({
  children,
  color,
  textColor = '#fff',
  ...props
}: {
  children: React.ReactNode
  color: string
  textColor?: string
} & (
  | { as: 'button'; onClick: () => void; disabled?: boolean; to?: never }
  | { as: 'link'; to: string; onClick?: never; disabled?: never }
)) {
  const className =
    'relative flex w-full items-center justify-center rounded-2xl p-4 text-center text-base font-extrabold shadow-lg disabled:opacity-60'
  const style = { backgroundColor: color, color: textColor }

  if (props.as === 'link') {
    return (
      <Link to={props.to} className={className} style={style}>
        {children}
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={className}
      style={style}
    >
      {children}
    </button>
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
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  const label = sameDay(date, today)
    ? 'Today'
    : sameDay(date, tomorrow)
      ? 'Tomorrow'
      : date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
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
            {status.supervisorName ? `Supervisor: ${status.supervisorName}` : 'Come climb!'} · until{' '}
            {formatTime(status.until)}
          </p>
        </>
      ) : status.next ? (
        <>
          <p className="mt-3 text-lg font-bold text-white">Gym is closed right now.</p>
          <p className="mt-1 text-sm text-neutral-400">
            Next session opens{' '}
            <span className="font-semibold text-white">{formatDateTime(status.next)}</span>.
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 text-lg font-bold text-white">Gym is closed.</p>
          <p className="mt-1 text-sm text-neutral-400">
            No upcoming sessions scheduled. Check back soon!
          </p>
        </>
      )}
    </div>
  )
}
