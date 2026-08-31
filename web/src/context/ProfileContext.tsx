import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@/context/AuthContext'
import { checkAndClearLapsedPass, findOrLinkProfile } from '@/services/profiles'
import type { UserProfile } from '@/types/member'

type ProfileContextType = {
  profile: UserProfile | null
  profileLoading: boolean
  /** True once the first profile lookup has completed (profile may still be null for new users). */
  profileReady: boolean
  reloadProfile: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  profileLoading: false,
  profileReady: false,
  reloadProfile: async () => {},
})

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileReady, setProfileReady] = useState(false)

  async function loadProfile() {
    if (!user) {
      setProfile(null)
      setProfileReady(false)
      return
    }
    setProfileLoading(true)
    try {
      let p = await findOrLinkProfile(user.uid, user.displayName ?? '', user.email ?? '', user.photoURL)
      if (p) {
        // Auto-transition membership status on every sign-in (e.g. expire outdated memberships)
        const updated = await checkAndClearLapsedPass(p, user.email ?? 'unknown')
        if (updated) p = updated
      }
      setProfile(p)
    } catch (e) {
      console.warn('Failed to load profile:', e)
    } finally {
      setProfileLoading(false)
      setProfileReady(true)
    }
  }

  useEffect(() => {
    // Fetches and sets state async (not synchronously), on user change only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  return (
    <ProfileContext.Provider value={{ profile, profileLoading, profileReady, reloadProfile: loadProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- context + its hook are one unit by convention
export function useProfile() {
  return useContext(ProfileContext)
}
