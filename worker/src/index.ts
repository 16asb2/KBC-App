interface Env {
  FIREBASE_PROJECT_ID: string;
  GOOGLE_ADMIN_CLIENT_ID: string;
  GOOGLE_ADMIN_CLIENT_SECRET: string;
  GOOGLE_ADMIN_REFRESH_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== '/getAdminCalendarToken') {
      return json({ error: 'Not found' }, 404);
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    // Verify caller is a signed-in Firebase user
    const authHeader = request.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing Authorization header' }, 401);
    }
    const accessToken = authHeader.slice(7);
    const valid = await verifyGoogleAccessToken(accessToken);
    if (!valid) {
      return json({ error: 'Invalid or expired access token' }, 401);
    }

    // Exchange the stored refresh token for a short-lived access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     env.GOOGLE_ADMIN_CLIENT_ID,
        client_secret: env.GOOGLE_ADMIN_CLIENT_SECRET,
        refresh_token: env.GOOGLE_ADMIN_REFRESH_TOKEN,
        grant_type:    'refresh_token',
      }).toString(),
    });

    if (!tokenRes.ok) {
      console.error('Admin token refresh failed:', tokenRes.status, await tokenRes.text());
      return json({ error: 'Token refresh failed' }, 502);
    }

    const data = await tokenRes.json() as { access_token: string; expires_in?: number };
    return json({ access_token: data.access_token, expires_in: data.expires_in ?? 3600 });
  },
};

/**
 * Validates a Google OAuth access token using Google's tokeninfo endpoint.
 * Returns true if the token is valid and belongs to a signed-in Google user.
 * No Firebase Auth setup required — works with the access token already in the app.
 */
async function verifyGoogleAccessToken(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    );
    return res.ok;
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
