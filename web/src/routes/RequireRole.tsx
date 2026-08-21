import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import type { UserProfile } from '@/types/member'

type RequireRoleProps = {
  check: (email: string | null, profile: UserProfile | null) => boolean
  redirectTo?: string
}

/** Generic role gate — pass a check from src/domain/roles.ts (isAdmin, isPrivileged, ...). */
export function RequireRole({ check, redirectTo = '/home' }: RequireRoleProps) {
  const { user } = useAuth()
  const { profile, profileReady } = useProfile()

  if (!profileReady) return null
  if (!check(user?.email ?? null, profile)) return <Navigate to={redirectTo} replace />
  return <Outlet />
}
