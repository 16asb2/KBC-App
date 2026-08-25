import { useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { isAdmin, isPrivileged } from '@/domain/roles'
import type { CalendarActor } from '@/domain/calendarPermissions'
import type { CalendarUser } from '@/services/calendar'

/**
 * Who the signed-in member is as far as the calendar is concerned.
 *
 * Calendar identity is separate from the Firestore profile: the name here is
 * what gets written into an event title and roster, and the roles are the
 * *resolved* ones — `isAdmin` runs through domain/roles.ts so the hardcoded
 * super-admin is an admin here even with no `isAdmin: true` on their profile.
 * Reading `profile.isAdmin` raw, as the Schedule page used to, left that
 * account unable to open a session its own UI offered it.
 *
 * Both pages that touch the calendar need the same three values, so they are
 * derived once here.
 */
export function useCalendarUser(): {
  calendarUser: CalendarUser | null
  actor: CalendarActor | null
  privileged: boolean
} {
  const { user } = useAuth()
  const { profile } = useProfile()

  const privileged = isPrivileged(user?.email ?? null, profile)

  return useMemo(() => {
    if (!user || !profile) return { calendarUser: null, actor: null, privileged }
    const name = profile.preferredName || profile.name
    return {
      calendarUser: {
        uid: profile.uid,
        name,
        isSupervisor: profile.isSupervisor,
        isAdmin: isAdmin(user.email, profile.isAdmin),
      },
      actor: { uid: profile.uid, name, privileged },
      privileged,
    }
  }, [user, profile, privileged])
}
