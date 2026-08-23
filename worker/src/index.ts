import { verifyFirebaseIdToken } from './verifyIdToken.ts';

interface Env {
  FIREBASE_PROJECT_ID: string;
  GOOGLE_ADMIN_CLIENT_ID: string;
  GOOGLE_ADMIN_CLIENT_SECRET: string;
  GOOGLE_ADMIN_REFRESH_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight — web/ calls this cross-origin from a browser.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname !== '/getAdminCalendarToken') {
      return json({ error: 'Not found' }, 404);
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    // Verify the caller is a signed-in user of this Firebase project.
    //
    // A Firebase ID token is the only credential accepted. web/ sends one
    // because Firebase Auth's JS SDK hands out a Google access token just
    // once, at sign-in, and never refreshes it, whereas ID tokens refresh
    // automatically. The token proves identity only; it grants no calendar
    // access of its own — that's what the admin token below is for.
    //
    // This used to also accept a Google OAuth access token, validated by
    // asking Google's tokeninfo endpoint whether it was live. That was
    // unsound: tokeninfo is public and answers for *any* valid Google token
    // from *any* OAuth client, so anyone could mint one against their own
    // app and trade it here for a KBC admin calendar token — a confused
    // deputy. Checking tokeninfo's `aud` would have closed it, but the only
    // caller of that path was mobile/, which never shipped and is gone, so
    // the path was removed instead.
    const authHeader = request.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing Authorization header' }, 401);
    }
    const idToken = authHeader.slice(7);

    // Anything that isn't a well-formed JWT fails inside here rather than
    // needing a shape check first: splitting a non-JWT yields too few
    // segments, the base64url decode throws, and the catch returns false.
    if (!(await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID))) {
      return json({ error: 'Invalid or expired credential' }, 401);
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

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
