import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useProfile } from '@/context/ProfileContext'

/**
 * Mirrors mobile@1cdfada/app/_layout.tsx's RootLayoutNav cascade:
 *   no profile / no legalName  → /setup           (brand-new user, or Google-only profile)
 *   no waiverMembership        → /waiver/membership
 *   no waiverLiability         → /waiver/liability
 *   otherwise                  → render the app (AppShell + tabs)
 *
 * /setup and /waiver/:type are nested under this gate too, so the pathname
 * checks below prevent it from redirecting a route back to itself.
 */
export function OnboardingGate() {
  const { profile, profileReady } = useProfile()
  const { pathname } = useLocation()

  if (!profileReady) return null

  if (!profile || !profile.legalName) {
    if (pathname !== '/setup') return <Navigate to="/setup" replace />
  } else if (!profile.waiverMembership) {
    if (pathname !== '/waiver/membership') return <Navigate to="/waiver/membership" replace />
  } else if (!profile.waiverLiability) {
    if (pathname !== '/waiver/liability') return <Navigate to="/waiver/liability" replace />
  }

  return <Outlet />
}
