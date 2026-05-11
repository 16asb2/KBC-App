import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { createContext, useContext, useEffect, useRef, useState } from 'react';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID!,
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

  // Scope is only needed once per session — track whether it's been granted
  const scopesGranted = useRef(false);
  // In-flight token request — deduplicate concurrent callers
  const inflightToken = useRef<Promise<string | null> | null>(null);

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
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (isSuccessResponse(response)) {
        setUser({
          id: response.data.user.id,
          name: response.data.user.name,
          email: response.data.user.email,
          photo: response.data.user.photo,
        });
      } else {
        console.warn('Sign-in response was not a success:', response);
      }
    } catch (e) {
      console.warn('Sign-in error:', e);
    }
  }

  async function signOut() {
    try {
      await GoogleSignin.signOut();
    } catch (e) {
      console.warn('GoogleSignin.signOut error (ignored):', e);
    } finally {
      setUser(null);
    }
  }

  async function getAccessToken(): Promise<string | null> {
    // If a request is already in flight, piggyback on it instead of firing a second one
    if (inflightToken.current) return inflightToken.current;

    const request = (async (): Promise<string | null> => {
      try {
        // addScopes only needs to run once — subsequent calls cause the race warning
        if (!scopesGranted.current) {
          const scopeResult = await GoogleSignin.addScopes({
            scopes: ['https://www.googleapis.com/auth/drive.file'],
          });
          if (!scopeResult) {
            console.warn('Drive scope was not granted by the user.');
            return null;
          }
          scopesGranted.current = true;
          // Clear cached token so the new scope is included
          const { accessToken } = await GoogleSignin.getTokens();
          await GoogleSignin.clearCachedAccessToken(accessToken);
        }

        const tokens = await GoogleSignin.getTokens();
        return tokens.accessToken;
      } catch (e) {
        console.warn('Error getting access token:', e);
        return null;
      } finally {
        inflightToken.current = null;
      }
    })();

    inflightToken.current = request;
    return request;
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
