/**
 * Module-level bridge between AuthProvider (React context) and service files (plain TS).
 * AuthProvider registers its token-getter functions here on mount/sign-in.
 * Service files call fetchWithAuth() / getAdminCalendarToken() without touching React.
 */

type TokenGetter      = () => Promise<string | null>;
type AdminTokenGetter = () => Promise<string>;
type CacheClearer     = () => void;

let _getFirebaseToken:      TokenGetter      | null = null;
let _getAdminCalendarToken: AdminTokenGetter | null = null;
let _clearTokenCache:       CacheClearer     | null = null;

export function registerBridge(
  firebaseGetter:      TokenGetter,
  adminCalendarGetter: AdminTokenGetter,
  cacheClearer:        CacheClearer,
) {
  _getFirebaseToken      = firebaseGetter;
  _getAdminCalendarToken = adminCalendarGetter;
  _clearTokenCache       = cacheClearer;
}

export function clearBridge() {
  _getFirebaseToken      = null;
  _getAdminCalendarToken = null;
  _clearTokenCache       = null;
}

/** Returns a valid Firebase ID token, or null if the user is not signed in. */
export async function getFirebaseToken(): Promise<string | null> {
  return _getFirebaseToken?.() ?? null;
}

/**
 * Fetch wrapper that injects the Firebase auth header and retries once on 401.
 * On a 401, the token cache is invalidated so the retry obtains a fresh token.
 * Use this instead of raw fetch() in every Firestore REST helper.
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const buildHeaders = async (): Promise<Record<string, string>> => {
    const token = await getFirebaseToken();
    return {
      ...(options.headers as Record<string, string> ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const res = await fetch(url, { ...options, headers: await buildHeaders() });

  if (res.status === 401) {
    // Force the next getFirebaseToken() call to bypass the cache and refresh.
    _clearTokenCache?.();
    return fetch(url, { ...options, headers: await buildHeaders() });
  }

  return res;
}

/**
 * Returns a valid Google Calendar access token for the KBC admin account.
 * Throws if AuthProvider is not mounted or the user is not signed in.
 */
export async function getAdminCalendarToken(): Promise<string> {
  if (!_getAdminCalendarToken) {
    throw new Error('Auth bridge not initialized — is AuthProvider mounted?');
  }
  return _getAdminCalendarToken();
}
