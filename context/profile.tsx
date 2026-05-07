import { createContext, useContext, useEffect, useState } from 'react';

import { useAuth } from '@/context/auth';
import { UserProfile, getOrCreateProfile } from '@/services/firestore';

type ProfileContextType = {
  profile: UserProfile | null;
  profileLoading: boolean;
  reloadProfile: () => Promise<void>;
};

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  profileLoading: false,
  reloadProfile: async () => {},
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  async function loadProfile() {
    if (!user) { setProfile(null); return; }
    setProfileLoading(true);
    try {
      const p = await getOrCreateProfile(user.id, user.name ?? '', user.email, user.photo);
      setProfile(p);
    } catch (e) {
      console.warn('Failed to load profile:', e);
    } finally {
      setProfileLoading(false);
    }
  }

  useEffect(() => { loadProfile(); }, [user?.id]);

  return (
    <ProfileContext.Provider value={{ profile, profileLoading, reloadProfile: loadProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
