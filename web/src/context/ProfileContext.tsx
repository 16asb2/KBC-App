import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@/context/AuthContext'
import { checkAndClearLapsedPass, findOrLinkProfile } from '@/services/profiles'
import type { UserProfile } from '@/types/member'

type ProfileContextType = {
  profile: UserProfile | null
  profileLoading: boolean
  /** True once the first profile lookup has completed (profile may still be null for new users). */
  profileReady: boolean
  /**
   * Set when the lookup *failed*, as opposed to finding nothing.
   *
   * The difference matters more than it looks. A null profile means "no record
   * here, send them to the setup form"; a thrown lookup means "we do not know",
   * and the two were indistinguishable — every failure presented as a brand-new
   * member staring at a blank form. Whatever the member then typed was written
   * with setDoc, over the top of the record that had failed to load, so a
   * denied write or a dropped connection turned into a wiped membership.
   */
  profileError: Error | null
  reloadProfile: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  profileLoading: false,
  profileReady: false,
  profileError: null,
  reloadProfile: async () => {},
})

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileReady, setProfileReady] = useState(false)
  const [profileError, setProfileError] = useState<Error | null>(null)

  async function loadProfile() {
    if (!user) {
      setProfile(null)
      setProfileReady(false)
      setProfileError(null)
      return
    }
    setProfileLoading(true)
    setProfileError(null)
    try {
      let p = await findOrLinkProfile(user.uid, user.displayName ?? '', user.email ?? '', user.photoURL)
      if (p) {
        // Auto-transition membership status on every sign-in (e.g. expire outdated memberships)
        const updated = await checkAndClearLapsedPass(p, user.email ?? 'unknown')
        if (updated) p = updated
      }
      setProfile(p)
    } catch (e) {
      // Loud, and kept: this is the one failure a member cannot work around,
      // and it used to be a console line nobody would ever see.
      console.error('[Profile] Failed to load profile for', user.email, e)
      setProfile(null)
      setProfileError(e instanceof Error ? e : new Error(String(e)))
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
    <ProfileContext.Provider
      value={{ profile, profileLoading, profileReady, profileError, reloadProfile: loadProfile }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- context + its hook are one unit by convention
export function useProfile() {
  return useContext(ProfileContext)
}
