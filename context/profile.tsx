import { createContext, useContext, useEffect, useState } from 'react';

import { useAuth } from '@/context/auth';
import { UserProfile, checkAndUpdateMembershipStatus, findOrLinkProfile } from '@/services/firestore';

type ProfileContextType = {
  profile: UserProfile | null;
  profileLoading: boolean;
  /** True once the first profile lookup has completed (profile may still be null for new users). */
  profileReady: boolean;
  reloadProfile: () => Promise<void>;
};

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  profileLoading: false,
  profileReady: false,
  reloadProfile: async () => {},
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile]           = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileReady, setProfileReady] = useState(false);

  async function loadProfile() {
    if (!user) { setProfile(null); setProfileReady(false); return; }
    setProfileLoading(true);
    try {
      let p = await findOrLinkProfile(user.id, user.name ?? '', user.email, user.photo);
      if (p) {
        // Auto-transition membership status on every sign-in (e.g. expire outdated memberships)
        const updated = await checkAndUpdateMembershipStatus(p, user.email);
        if (updated) p = updated;
      }
      setProfile(p);
    } catch (e) {
      console.warn('Failed to load profile:', e);
    } finally {
      setProfileLoading(false);
      setProfileReady(true);
    }
  }

  useEffect(() => { loadProfile(); }, [user?.id]);

  return (
    <ProfileContext.Provider value={{ profile, profileLoading, profileReady, reloadProfile: loadProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
