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
import { NewMemberSetupPage } from '@/pages/NewMemberSetupPage'
import { WaiverPage } from '@/pages/WaiverPage'
import { HomePage } from '@/pages/HomePage'
import { SchedulePage } from '@/pages/SchedulePage'
import { CalendarPage } from '@/pages/CalendarPage'
import { MembersPage } from '@/pages/MembersPage'
import { AdminManagementPage } from '@/pages/AdminManagementPage'
import { BouldersPage } from '@/pages/BouldersPage'
import { ClimbLogPage } from '@/pages/ClimbLogPage'
import { LogbookPage } from '@/pages/LogbookPage'

function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
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
                <Route path="/logbook" element={<LogbookPage />} />
                <Route path="/schedule" element={<SchedulePage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route element={<RequireRole check={isPrivileged} />}>
                  <Route path="/members" element={<MembersPage />} />
                </Route>
                <Route element={<RequireRole check={(email, profile) => isAdmin(email, profile?.isAdmin)} />}>
                  <Route path="/admin-management" element={<AdminManagementPage />} />
                </Route>
                <Route path="/boulders" element={<BouldersPage />} />
                <Route path="/climblog" element={<ClimbLogPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ProfileProvider>
    </AuthProvider>
  )
}

export default App
