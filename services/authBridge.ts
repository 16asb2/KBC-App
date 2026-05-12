/**
 * Module-level bridge between AuthProvider (React context) and service files (plain TS).
 * AuthProvider registers its token-getter functions here on mount/sign-in.
 * Service files call getFirebaseToken() / getAdminCalendarToken() without touching React.
 */

type TokenGetter      = () => Promise<string | null>;
type AdminTokenGetter = () => Promise<string>;

let _getFirebaseToken:      TokenGetter      | null = null;
let _getAdminCalendarToken: AdminTokenGetter | null = null;

export function registerBridge(
  firebaseGetter:      TokenGetter,
  adminCalendarGetter: AdminTokenGetter,
) {
  _getFirebaseToken      = firebaseGetter;
  _getAdminCalendarToken = adminCalendarGetter;
}

export function clearBridge() {
  _getFirebaseToken      = null;
  _getAdminCalendarToken = null;
}

/** Returns a valid Firebase ID token, or null if the user is not signed in. */
export async function getFirebaseToken(): Promise<string | null> {
  return _getFirebaseToken?.() ?? null;
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
