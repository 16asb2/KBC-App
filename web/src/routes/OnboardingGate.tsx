import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ProfileLoadError } from '@/components/ProfileLoadError'
import { useProfile } from '@/context/ProfileContext'
import { needsProfileReview } from '@/domain/memberProfile'

/**
 * Mirrors mobile@1cdfada/app/_layout.tsx's RootLayoutNav cascade:
 *   no profile / not yet reviewed → /setup           (brand-new user, a partial
 *                                                     record, or one written for
 *                                                     someone before they arrived)
 *   no waiverMembership         → /waiver/membership
 *   no waiverLiability          → /waiver/liability
 *   otherwise                   → render the app (AppShell + tabs)
 *
 * /setup and /waiver/:type are nested under this gate too, so the pathname
 * checks below prevent it from redirecting a route back to itself.
 *
 * The first test used to be `!profile.legalName` alone, which was enough while
 * every profile was born through the setup form. Records now also arrive from a
 * CSV import in admin-web/, and a spreadsheet frequently has a name and an
 * email and no emergency contact — a member whose record was missing their next
 * of kin would sail past this gate and climb. It now asks for anything the
 * setup form itself would insist on.
 *
 * A complete imported record stops here too, once. Nobody has checked what the
 * spreadsheet said about them, and the waiver on the next screen is signed
 * against exactly that. `needsProfileReview` holds the whole rule.
 *
 * All of that reads a profile that loaded. One that *failed* to load is a
 * separate answer from one that came back empty, and conflating them sent
 * members with years of membership to a blank registration form — see
 * `profileError` on ProfileContext.
 */
export function OnboardingGate() {
  const { profile, profileReady, profileError, profileLoading, reloadProfile } = useProfile()
  const { pathname } = useLocation()

  if (!profileReady) return null

  // A lookup that *failed* is not a member without a record, and must never be
  // answered with the setup form — see ProfileLoadError for what that costs.
  if (profileError) {
    return (
      <ProfileLoadError
        error={profileError}
        onRetry={() => void reloadProfile()}
        retrying={profileLoading}
      />
    )
  }

  if (!profile || needsProfileReview(profile)) {
    if (pathname !== '/setup') return <Navigate to="/setup" replace />
  } else if (!profile.waiverMembership) {
    if (pathname !== '/waiver/membership') return <Navigate to="/waiver/membership" replace />
  } else if (!profile.waiverLiability) {
    if (pathname !== '/waiver/liability') return <Navigate to="/waiver/liability" replace />
  }

  return <Outlet />
}
