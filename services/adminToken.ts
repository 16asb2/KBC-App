// The admin refresh token was obtained via the Desktop app client (KBC Admin Script 2).
// Token refresh must use the same client that issued the refresh token.
const CLIENT_ID     = process.env.EXPO_PUBLIC_GOOGLE_ADMIN_CLIENT_ID!;
const CLIENT_SECRET = process.env.EXPO_PUBLIC_GOOGLE_ADMIN_CLIENT_SECRET!;
const REFRESH_TOKEN = process.env.EXPO_PUBLIC_GOOGLE_ADMIN_REFRESH_TOKEN!;

let cachedToken:    string | null = null;
let tokenExpiresAt: number        = 0;

/**
 * Returns a valid Google OAuth access token for the KBC super-admin account.
 * Used internally by all calendar WRITE operations so that no individual user's
 * credentials are required for calendar mutations.
 *
 * Caches the token in memory; refreshes automatically ~60 s before expiry.
 */
export async function getAdminCalendarToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Admin calendar token refresh failed (${res.status}): ${text}`);
  }

  const data      = await res.json();
  cachedToken     = data.access_token as string;
  tokenExpiresAt  = now + (data.expires_in ?? 3600) * 1000;
  return cachedToken;
}
