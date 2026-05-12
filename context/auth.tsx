import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { registerBridge, clearBridge } from '@/services/authBridge';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID!,
  offlineAccess: false,
});

const FIREBASE_API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY!;
const CLOUD_FN_BASE    = process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL ?? '';

// Legacy on-device admin token credentials.
// These are still read from env vars during the transition period before the
// Cloud Function is deployed. Once the Cloud Function is live and
// EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL is set, remove these three vars from .env.
const LEGACY_ADMIN_CLIENT_ID     = process.env.EXPO_PUBLIC_GOOGLE_ADMIN_CLIENT_ID ?? '';
const LEGACY_ADMIN_CLIENT_SECRET = process.env.EXPO_PUBLIC_GOOGLE_ADMIN_CLIENT_SECRET ?? '';
const LEGACY_ADMIN_REFRESH_TOKEN = process.env.EXPO_PUBLIC_GOOGLE_ADMIN_REFRESH_TOKEN ?? '';

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
  getFirebaseToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextType | null>(null);

// ─── Firebase Auth REST helpers ───────────────────────────────────────────────

async function exchangeGoogleIdToken(
  googleIdToken: string,
): Promise<{ idToken: string; refreshToken: string } | null> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestUri: 'http://localhost',
        postBody: `id_token=${googleIdToken}&providerId=google.com`,
        returnSecureToken: true,
      }),
    },
  );
  if (!res.ok) {
    console.warn('Firebase Auth exchange failed:', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return { idToken: data.idToken as string, refreshToken: data.refreshToken as string };
}

async function refreshFirebaseIdToken(
  firebaseRefreshToken: string,
): Promise<{ idToken: string; refreshToken: string } | null> {
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: firebaseRefreshToken }),
    },
  );
  if (!res.ok) {
    console.warn('Firebase token refresh failed:', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return { idToken: data.id_token as string, refreshToken: data.refresh_token as string };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading]   = useState(true);

  // Google Calendar scope tracking
  const scopesGranted     = useRef(false);
  const inflightToken     = useRef<Promise<string | null> | null>(null);

  // Firebase session — held in memory only (never written to storage)
  const firebaseIdToken   = useRef<string | null>(null);
  const firebaseRefresh   = useRef<string | null>(null);
  const firebaseExpiresAt = useRef<number>(0);
  const inflightFbToken   = useRef<Promise<string | null> | null>(null);

  // Admin calendar token cache
  const adminToken        = useRef<string | null>(null);
  const adminExpiresAt    = useRef<number>(0);
  const inflightAdminTok  = useRef<Promise<string> | null>(null);

  // ─── Restore session on mount ──────────────────────────────────────────────

  useEffect(() => {
    async function restoreSession() {
      try {
        const currentUser = GoogleSignin.getCurrentUser();
        if (currentUser) {
          setUser({
            id: currentUser.user.id, name: currentUser.user.name,
            email: currentUser.user.email, photo: currentUser.user.photo,
          });
          // Re-establish Firebase session via silent sign-in
          try {
            const silent = await GoogleSignin.signInSilently();
            if (silent.type === 'success' && silent.data.idToken) {
              const fb = await exchangeGoogleIdToken(silent.data.idToken);
              if (fb) {
                firebaseIdToken.current   = fb.idToken;
                firebaseRefresh.current   = fb.refreshToken;
                firebaseExpiresAt.current = Date.now() + 55 * 60 * 1000;
              }
            }
          } catch (e) {
            console.warn('Silent Firebase session restore failed:', e);
          }
        }
      } catch (e) {
        console.warn('Error restoring session:', e);
      } finally {
        setLoading(false);
        registerBridge(getFirebaseToken, getAdminCalendarToken);
      }
    }
    restoreSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Auth actions ──────────────────────────────────────────────────────────

  async function signIn() {
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) {
        console.warn('Sign-in response was not a success:', response);
        return;
      }
      setUser({
        id: response.data.user.id, name: response.data.user.name,
        email: response.data.user.email, photo: response.data.user.photo,
      });
      // Exchange Google ID token for Firebase session
      if (response.data.idToken) {
        const fb = await exchangeGoogleIdToken(response.data.idToken);
        if (fb) {
          firebaseIdToken.current   = fb.idToken;
          firebaseRefresh.current   = fb.refreshToken;
          firebaseExpiresAt.current = Date.now() + 55 * 60 * 1000;
        }
      }
      registerBridge(getFirebaseToken, getAdminCalendarToken);
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
      firebaseIdToken.current   = null;
      firebaseRefresh.current   = null;
      firebaseExpiresAt.current = 0;
      adminToken.current        = null;
      adminExpiresAt.current    = 0;
      clearBridge();
    }
  }

  // ─── Token getters ────────────────────────────────────────────────────────

  /** Google access token — used for Calendar read operations. */
  async function getAccessToken(): Promise<string | null> {
    if (inflightToken.current) return inflightToken.current;
    const request = (async (): Promise<string | null> => {
      try {
        if (!scopesGranted.current) {
          const scopeResult = await GoogleSignin.addScopes({
            scopes: ['https://www.googleapis.com/auth/calendar.events'],
          });
          if (!scopeResult) { console.warn('Calendar scope not granted.'); return null; }
          scopesGranted.current = true;
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

  /** Firebase ID token — used to authenticate Firestore requests and Cloud Function calls. */
  async function getFirebaseToken(): Promise<string | null> {
    if (inflightFbToken.current) return inflightFbToken.current;
    const request = (async (): Promise<string | null> => {
      try {
        const now = Date.now();
        if (firebaseIdToken.current && now < firebaseExpiresAt.current) {
          return firebaseIdToken.current;
        }
        // Refresh using stored Firebase refresh token
        if (firebaseRefresh.current) {
          const fb = await refreshFirebaseIdToken(firebaseRefresh.current);
          if (fb) {
            firebaseIdToken.current   = fb.idToken;
            firebaseRefresh.current   = fb.refreshToken;
            firebaseExpiresAt.current = now + 55 * 60 * 1000;
            return firebaseIdToken.current;
          }
        }
        // Last resort: silent sign-in to get a fresh Google ID token to exchange
        try {
          const silent = await GoogleSignin.signInSilently();
          if (silent.type === 'success' && silent.data.idToken) {
            const fb = await exchangeGoogleIdToken(silent.data.idToken);
            if (fb) {
              firebaseIdToken.current   = fb.idToken;
              firebaseRefresh.current   = fb.refreshToken;
              firebaseExpiresAt.current = now + 55 * 60 * 1000;
              return firebaseIdToken.current;
            }
          }
        } catch {}
        return null;
      } catch (e) {
        console.warn('Error getting Firebase token:', e);
        return null;
      } finally {
        inflightFbToken.current = null;
      }
    })();
    inflightFbToken.current = request;
    return request;
  }

  /**
   * Google Calendar access token for the KBC admin account.
   * Uses the Cloud Function when EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL is set;
   * falls back to legacy on-device token refresh otherwise.
   * Remove the legacy path after the Cloud Function is deployed.
   */
  async function getAdminCalendarToken(): Promise<string> {
    if (inflightAdminTok.current) return inflightAdminTok.current;
    const request = (async (): Promise<string> => {
      try {
        const now = Date.now();
        if (adminToken.current && now < adminExpiresAt.current) {
          return adminToken.current;
        }

        if (CLOUD_FN_BASE) {
          const accessToken = await getAccessToken();
          if (!accessToken) throw new Error('Not authenticated — cannot fetch admin calendar token.');
          const res = await fetch(`${CLOUD_FN_BASE}/getAdminCalendarToken`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!res.ok) {
            const body = await res.text();
            throw new Error(`Cloud Function error ${res.status}: ${body}`);
          }
          const data = await res.json() as { access_token: string; expires_in: number };
          adminToken.current    = data.access_token;
          adminExpiresAt.current = now + (data.expires_in - 60) * 1000;
          return adminToken.current;
        }

        // Legacy: refresh admin token on-device using EXPO_PUBLIC_ credentials.
        // INSECURE — these credentials are in the app bundle. Remove after deploying Cloud Function.
        if (!LEGACY_ADMIN_REFRESH_TOKEN) {
          throw new Error('Admin token not configured — set EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL or legacy vars.');
        }
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id:     LEGACY_ADMIN_CLIENT_ID,
            client_secret: LEGACY_ADMIN_CLIENT_SECRET,
            refresh_token: LEGACY_ADMIN_REFRESH_TOKEN,
            grant_type:    'refresh_token',
          }).toString(),
        });
        if (!tokenRes.ok) {
          const text = await tokenRes.text();
          throw new Error(`Legacy admin token refresh failed (${tokenRes.status}): ${text}`);
        }
        const data = await tokenRes.json() as { access_token: string; expires_in?: number };
        adminToken.current    = data.access_token;
        adminExpiresAt.current = now + ((data.expires_in ?? 3600) - 60) * 1000;
        return adminToken.current;
      } finally {
        inflightAdminTok.current = null;
      }
    })();
    inflightAdminTok.current = request;
    return request;
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, getAccessToken, getFirebaseToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
