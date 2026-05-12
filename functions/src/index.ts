import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { defineSecret } from 'firebase-functions/params';

initializeApp();

// Toronto region — closest to KBC (Kingston, Ontario)
setGlobalOptions({ region: 'northamerica-northeast2' });

const adminClientId     = defineSecret('GOOGLE_ADMIN_CLIENT_ID');
const adminClientSecret = defineSecret('GOOGLE_ADMIN_CLIENT_SECRET');
const adminRefreshToken = defineSecret('GOOGLE_ADMIN_REFRESH_TOKEN');

/**
 * Returns a short-lived Google Calendar access token for the KBC admin account.
 *
 * The caller must include a valid Firebase ID token:
 *   Authorization: Bearer <firebase-id-token>
 *
 * The admin OAuth credentials (client ID, client secret, refresh token) never
 * leave this function — they are stored in Google Cloud Secret Manager and are
 * not visible in the app bundle.
 *
 * Deploy: firebase deploy --only functions
 * Set secrets:
 *   firebase functions:secrets:set GOOGLE_ADMIN_CLIENT_ID
 *   firebase functions:secrets:set GOOGLE_ADMIN_CLIENT_SECRET
 *   firebase functions:secrets:set GOOGLE_ADMIN_REFRESH_TOKEN
 */
export const getAdminCalendarToken = onRequest(
  { secrets: [adminClientId, adminClientSecret, adminRefreshToken], cors: false },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const authHeader = req.headers.authorization ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }

    try {
      await getAuth().verifyIdToken(authHeader.slice(7));
    } catch {
      res.status(401).json({ error: 'Invalid or expired ID token' });
      return;
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     adminClientId.value(),
        client_secret: adminClientSecret.value(),
        refresh_token: adminRefreshToken.value(),
        grant_type:    'refresh_token',
      }).toString(),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error('Admin token refresh failed:', tokenRes.status, body);
      res.status(502).json({ error: 'Token refresh failed' });
      return;
    }

    const data = await tokenRes.json() as { access_token: string; expires_in?: number };
    res.json({ access_token: data.access_token, expires_in: data.expires_in ?? 3600 });
  },
);
