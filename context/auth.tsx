import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { createContext, useContext, useEffect, useState } from 'react';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

GoogleSignin.configure({
  webClientId: '935469832384-02ign2e0dfo6sj1ergotr445fb6nqv2b.apps.googleusercontent.com',
  scopes: ['https://www.googleapis.com/auth/calendar'],
  offlineAccess: false,
});

type User = {
  id: string;
  name: string | null;
  email: string;
  photo: string | null;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const currentUser = GoogleSignin.getCurrentUser();
      if (currentUser) {
        setUser({
          id: currentUser.user.id,
          name: currentUser.user.name,
          email: currentUser.user.email,
          photo: currentUser.user.photo,
        });
      }
    } catch (e) {
      console.warn('Error getting current user:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  async function signIn() {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (isSuccessResponse(response)) {
      setUser({
        id: response.data.user.id,
        name: response.data.user.name,
        email: response.data.user.email,
        photo: response.data.user.photo,
      });
    }
  }

  async function signOut() {
    await GoogleSignin.signOut();
    setUser(null);
  }

  async function getAccessToken(): Promise<string | null> {
    try {
      await GoogleSignin.clearCachedAccessToken((await GoogleSignin.getTokens()).accessToken);
      const tokens = await GoogleSignin.getTokens();
      return tokens.accessToken;
    } catch (e) {
      console.warn('Error getting access token:', e);
      return null;
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, getAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
