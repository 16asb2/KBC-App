import { useAuth } from '@/context/AuthContext'
import { KBC } from '@/constants/theme'

/**
 * The header for the screens that come *before* the app: the setup form and
 * the waivers.
 *
 * Sign Out used to live only in `AppShell`'s header, which renders once the
 * onboarding gate has already passed. Anyone the gate held — a member whose
 * record is incomplete, or who signed in with the wrong Google account — had no
 * way out of the form and no way to switch accounts. The session persists
 * deliberately (see lib/firebase.ts), so reopening the app dropped them
 * straight back onto the same form without ever asking who they were.
 *
 * Which is why the address is shown rather than kept in a tooltip the way the
 * in-app header does it: the question this bar has to answer at a glance is
 * "is this even me?", and on the screens where somebody is stuck, it usually
 * is not.
 */
export function OnboardingHeader() {
  const { user, signOut } = useAuth()

  return (
    <header
      className="flex items-center justify-between gap-3 px-4 py-3"
      style={{ backgroundColor: KBC.black }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <img src="/kbc-logo.png" alt="" className="size-9 shrink-0 rounded-lg" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-white">Signed in as</p>
          <p className="truncate text-[12px] text-neutral-400">{user?.email ?? 'Unknown account'}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="shrink-0 rounded-lg border px-3 py-1.5 text-[13px] font-semibold"
        style={{ borderColor: KBC.pink, color: KBC.pink }}
      >
        Sign Out
      </button>
    </header>
  )
}
