import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { ProfileProvider } from '@/context/ProfileContext'
import { ScheduleProvider } from '@/context/ScheduleContext'
import { RequireAuth } from '@/routes/RequireAuth'
import { RequireRole } from '@/routes/RequireRole'
import { OnboardingGate } from '@/routes/OnboardingGate'
import { isAdmin, isPrivileged } from '@/domain/roles'
import { AppShell } from '@/layout/AppShell'
import { LoginPage } from '@/pages/LoginPage'

// Every screen past the login page is loaded on demand.
//
// The whole app was one 975 kB chunk, so a member opening Home paid to
// download the boulder editor, the waiver text, the admin screens and the
// sign-in book as well. Splitting per route means the first paint carries the
// shell and the tab you asked for, and the rest arrives as you move around.
//
// LoginPage is deliberately *not* lazy: it is the one screen a signed-out
// visitor is guaranteed to see, and a spinner before the sign-in button is a
// worse first impression than the few kB it costs to bundle it up front.
const NewMemberSetupPage = lazy(() =>
  import('@/pages/NewMemberSetupPage').then((m) => ({ default: m.NewMemberSetupPage })),
)
const WaiverPage = lazy(() => import('@/pages/WaiverPage').then((m) => ({ default: m.WaiverPage })))
const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })))
const SchedulePage = lazy(() =>
  import('@/pages/SchedulePage').then((m) => ({ default: m.SchedulePage })),
)
const CalendarPage = lazy(() =>
  import('@/pages/CalendarPage').then((m) => ({ default: m.CalendarPage })),
)
const MembersPage = lazy(() =>
  import('@/pages/MembersPage').then((m) => ({ default: m.MembersPage })),
)
const ProfilePage = lazy(() =>
  import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)
const AdminManagementPage = lazy(() =>
  import('@/pages/AdminManagementPage').then((m) => ({ default: m.AdminManagementPage })),
)
const BouldersPage = lazy(() =>
  import('@/pages/BouldersPage').then((m) => ({ default: m.BouldersPage })),
)
const ClimbLogPage = lazy(() =>
  import('@/pages/ClimbLogPage').then((m) => ({ default: m.ClimbLogPage })),
)
const LogbookPage = lazy(() =>
  import('@/pages/LogbookPage').then((m) => ({ default: m.LogbookPage })),
)

/**
 * Shown while a route's chunk is in flight. Deliberately plain: on a warm cache
 * it is on screen for a frame or two, and anything more elaborate would flash.
 */
function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center p-10">
      <p className="text-sm text-neutral-400">Loading…</p>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<RequireAuth />}>
              <Route element={<OnboardingGate />}>
                <Route path="/setup" element={<NewMemberSetupPage />} />
                <Route path="/waiver/:type" element={<WaiverPage />} />

                <Route
                  element={
                    <ScheduleProvider>
                      <AppShell />
                    </ScheduleProvider>
                  }
                >
                  <Route index element={<Navigate to="/home" replace />} />
                  <Route path="/home" element={<HomePage />} />
                  {/* Every member's own record — deliberately outside the
                      RequireRole gate below, which is what used to put a
                      member's own profile behind supervisor permissions. */}
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/logbook" element={<LogbookPage />} />
                  <Route path="/schedule" element={<SchedulePage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route element={<RequireRole check={isPrivileged} />}>
                    <Route path="/members" element={<MembersPage />} />
                  </Route>
                  <Route
                    element={
                      <RequireRole check={(email, profile) => isAdmin(email, profile?.isAdmin)} />
                    }
                  >
                    <Route path="/admin-management" element={<AdminManagementPage />} />
                  </Route>
                  <Route path="/boulders" element={<BouldersPage />} />
                  <Route path="/climblog" element={<ClimbLogPage />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ProfileProvider>
    </AuthProvider>
  )
}

export default App
