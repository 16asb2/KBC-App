import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { registerBridge, clearBridge } from '@/services/authBridge';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
console.log('[Auth] configure webClientId:', GOOGLE_WEB_CLIENT_ID ?? '*** UNDEFINED ***');
GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID!,
  offlineAccess: false,
});

const FIREBASE_API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY!;
const CLOUD_FN_BASE    = process.env.EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL!;

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
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  getFirebaseToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextType | null>(null);

// ─── Firebase Auth REST helpers ───────────────────────────────────────────────

async function exchangeGoogleIdToken(
  googleIdToken: string,
): Promise<{ idToken: string; refreshToken: string; uid: string } | null> {
  console.log('[Auth] exchangeGoogleIdToken: calling Identity Toolkit, apiKey length:', FIREBASE_API_KEY?.length ?? 0);
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
    console.warn('[Auth] exchangeGoogleIdToken FAILED:', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  console.log('[Auth] exchangeGoogleIdToken: success, Firebase uid:', data.localId);
  // localId is the Firebase Auth UID — used as user.id so it matches request.auth.uid in Firestore rules
  return { idToken: data.idToken as string, refreshToken: data.refreshToken as string, uid: data.localId as string };
}

async function exchangeAppleIdToken(
  appleIdToken: string,
): Promise<{ idToken: string; refreshToken: string; uid: string; email: string; displayName: string | null } | null> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestUri: 'http://localhost',
        postBody: `id_token=${appleIdToken}&providerId=apple.com`,
        returnSecureToken: true,
      }),
    },
  );
  if (!res.ok) {
    console.warn('[Auth] exchangeAppleIdToken FAILED:', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return {
    idToken: data.idToken as string,
    refreshToken: data.refreshToken as string,
    uid: data.localId as string,
    email: data.email as string,
    displayName: (data.displayName as string | null) ?? null,
  };
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

  const authProvider = useRef<'google' | 'apple' | null>(null);

  // Google Calendar scope tracking
  const scopesGranted        = useRef(false);
  const inflightToken        = useRef<Promise<string | null> | null>(null);
  const googleTokenExpiresAt = useRef<number>(0);

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
          console.log('[Auth] restoreSession: found existing Google user:', currentUser.user.email);
          // Establish Firebase session BEFORE setting user — if silent sign-in fails,
          // user stays null and the layout redirects to login for a fresh interactive sign-in.
          try {
            console.log('[Auth] restoreSession: attempting silent sign-in…');
            const silent = await GoogleSignin.signInSilently();
            console.log('[Auth] restoreSession: silent sign-in result type:', silent.type);
            if (silent.type === 'success' && silent.data.idToken) {
              const fb = await exchangeGoogleIdToken(silent.data.idToken);
              if (fb) {
                firebaseIdToken.current   = fb.idToken;
                firebaseRefresh.current   = fb.refreshToken;
                firebaseExpiresAt.current = Date.now() + 55 * 60 * 1000;
                console.log('[Auth] restoreSession: Firebase session restored — setting user');
                setUser({
                  id: fb.uid, name: currentUser.user.name,
                  email: currentUser.user.email, photo: currentUser.user.photo,
                });
              } else {
                console.warn('[Auth] restoreSession: Firebase exchange returned null — redirecting to login');
              }
            } else {
              console.warn('[Auth] restoreSession: silent sign-in returned', silent.type, '— redirecting to login');
            }
          } catch (e) {
            console.warn('[Auth] restoreSession: silent sign-in threw:', e);
          }
        }
      } catch (e) {
        console.warn('Error restoring session:', e);
      } finally {
        registerBridge(getFirebaseToken, getAdminCalendarToken, clearFirebaseTokenCache);
        setLoading(false);
      }
    }
    restoreSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Foreground resume: proactively refresh stale tokens ──────────────────

  const backgroundedAt = useRef<number>(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundedAt.current = Date.now();
        return;
      }
      if (nextState !== 'active') return;
      if (!firebaseRefresh.current) return; // not signed in

      const timeInBackground = Date.now() - backgroundedAt.current;
      // After 2 hours in background, force re-sign-in to avoid stale-token Firestore errors.
      // Firebase ID tokens live for 60 min; refresh tokens can also become invalid after long inactivity.
      const FORCE_REAUTH_THRESHOLD_MS = 2 * 60 * 60 * 1000;
      if (timeInBackground >= FORCE_REAUTH_THRESHOLD_MS) {
        console.warn('[Auth] App inactive for ≥2 h — forcing re-sign-in to refresh credentials');
        await signOut();
        return;
      }

      // Normal foreground resume: force-expire the cached token and get a fresh one.
      firebaseExpiresAt.current = 0;
      const freshToken = await getFirebaseToken();
      if (!freshToken) {
        // All refresh paths failed (expired/revoked refresh token) — force re-login.
        console.warn('[Auth] Token refresh failed on foreground — forcing re-sign-in');
        await signOut();
        return;
      }
      // Force-expire the cached Google access token so the next Calendar call fetches a fresh one.
      googleTokenExpiresAt.current = 0;
    });
    return () => sub.remove();
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
      if (!response.data.idToken) {
        console.warn('[Auth] signIn: Google sign-in response had no idToken');
        return;
      }
      console.log('[Auth] signIn: exchanging Google idToken for Firebase token…');
      const fb = await exchangeGoogleIdToken(response.data.idToken);
      if (!fb) {
        console.warn('[Auth] signIn: Firebase exchange returned null — aborting sign-in');
        return;
      }
      firebaseIdToken.current   = fb.idToken;
      firebaseRefresh.current   = fb.refreshToken;
      firebaseExpiresAt.current = Date.now() + 55 * 60 * 1000;
      authProvider.current      = 'google';
      console.log('[Auth] signIn: Firebase token acquired successfully — setting user');
      registerBridge(getFirebaseToken, getAdminCalendarToken, clearFirebaseTokenCache);
      setUser({
        id: fb.uid, name: response.data.user.name,
        email: response.data.user.email, photo: response.data.user.photo,
      });
    } catch (e) {
      console.warn('Sign-in error:', e);
    }
  }

  async function signInWithApple() {
    if (Platform.OS !== 'ios') return;
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        console.warn('[Auth] signInWithApple: no identityToken');
        return;
      }
      const fb = await exchangeAppleIdToken(credential.identityToken);
      if (!fb) {
        console.warn('[Auth] signInWithApple: Firebase exchange failed');
        return;
      }
      // Apple only returns name/email on the very first sign-in; fall back to what Firebase stored.
      const givenName  = credential.fullName?.givenName  ?? null;
      const familyName = credential.fullName?.familyName ?? null;
      const name = (givenName || familyName)
        ? [givenName, familyName].filter(Boolean).join(' ')
        : fb.displayName;

      firebaseIdToken.current   = fb.idToken;
      firebaseRefresh.current   = fb.refreshToken;
      firebaseExpiresAt.current = Date.now() + 55 * 60 * 1000;
      authProvider.current      = 'apple';
      registerBridge(getFirebaseToken, getAdminCalendarToken, clearFirebaseTokenCache);
      setUser({ id: fb.uid, name, email: fb.email, photo: null });
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        console.warn('[Auth] signInWithApple error:', e);
      }
    }
  }

  async function signOut() {
    if (authProvider.current === 'google') {
      try {
        await GoogleSignin.signOut();
      } catch (e) {
        console.warn('GoogleSignin.signOut error (ignored):', e);
      }
    }
    setUser(null);
    firebaseIdToken.current    = null;
    firebaseRefresh.current    = null;
    firebaseExpiresAt.current  = 0;
    adminToken.current         = null;
    adminExpiresAt.current     = 0;
    scopesGranted.current      = false;
    googleTokenExpiresAt.current = 0;
    authProvider.current       = null;
    clearBridge();
  }

  // ─── Token getters ────────────────────────────────────────────────────────

  /** Forces the next getFirebaseToken() call to bypass the cache and refresh. */
  function clearFirebaseTokenCache(): void {
    firebaseExpiresAt.current = 0;
  }

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
        }
        // If our tracked expiry has passed, evict the cached token so getTokens() fetches a fresh one.
        const now = Date.now();
        if (now >= googleTokenExpiresAt.current) {
          try {
            const { accessToken: stale } = await GoogleSignin.getTokens();
            await GoogleSignin.clearCachedAccessToken(stale);
          } catch {}
        }
        const tokens = await GoogleSignin.getTokens();
        googleTokenExpiresAt.current = now + 55 * 60 * 1000;
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
        // All refresh paths failed — do not fall back to a potentially stale token.
        // Return null so callers can detect total failure and trigger re-authentication.
        console.warn('[Auth] getFirebaseToken: all refresh paths exhausted, returning null');
        return null;
      } catch (e) {
        console.warn('Error getting Firebase token:', e);
        return firebaseIdToken.current;
      } finally {
        inflightFbToken.current = null;
      }
    })();
    inflightFbToken.current = request;
    return request;
  }

  /** Google Calendar access token for the KBC admin account, via Cloudflare Worker. */
  async function getAdminCalendarToken(): Promise<string> {
    if (inflightAdminTok.current) return inflightAdminTok.current;
    const request = (async (): Promise<string> => {
      try {
        const now = Date.now();
        if (adminToken.current && now < adminExpiresAt.current) {
          return adminToken.current;
        }
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error('Not authenticated — cannot fetch admin calendar token.');
        const res = await fetch(`${CLOUD_FN_BASE}/getAdminCalendarToken`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Admin token worker error ${res.status}: ${body}`);
        }
        const data = await res.json() as { access_token: string; expires_in: number };
        adminToken.current     = data.access_token;
        adminExpiresAt.current = now + (data.expires_in - 60) * 1000;
        return adminToken.current;
      } finally {
        inflightAdminTok.current = null;
      }
    })();
    inflightAdminTok.current = request;
    return request;
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signInWithApple, signOut, getAccessToken, getFirebaseToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
