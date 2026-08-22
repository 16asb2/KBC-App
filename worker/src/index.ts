interface Env {
  FIREBASE_PROJECT_ID: string;
  GOOGLE_ADMIN_CLIENT_ID: string;
  GOOGLE_ADMIN_CLIENT_SECRET: string;
  GOOGLE_ADMIN_REFRESH_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight — the web app (web/) calls this cross-origin from a
    // browser; the mobile app doesn't need this but it's harmless there.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname !== '/getAdminCalendarToken') {
      return json({ error: 'Not found' }, 404);
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    // Verify caller is a signed-in KBC user.
    //
    // Two credential types are accepted, because the two clients differ:
    //   - mobile/ sends a Google OAuth *access token* (opaque, "ya29.…"),
    //     which it already holds for the Calendar scope.
    //   - web/ sends a Firebase *ID token* (a JWT), because Firebase Auth's
    //     JS SDK only hands out a Google access token once at sign-in and
    //     never refreshes it, whereas ID tokens refresh automatically.
    // Both prove the caller is a signed-in user; neither grants calendar
    // access on its own — that's what the admin token below is for.
    const authHeader = request.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing Authorization header' }, 401);
    }
    const credential = authHeader.slice(7);

    const valid = looksLikeJwt(credential)
      ? await verifyFirebaseIdToken(credential, env.FIREBASE_PROJECT_ID)
      : await verifyGoogleAccessToken(credential);

    if (!valid) {
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

/**
 * Validates a Google OAuth access token using Google's tokeninfo endpoint.
 * Returns true if the token is valid and belongs to a signed-in Google user.
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

// ─── Firebase ID token verification ──────────────────────────────────────────
// Firebase ID tokens are RS256 JWTs signed by Google. Verifying one means
// checking the signature against Google's published public keys, plus the
// standard claims. Done by hand here rather than pulling in firebase-admin,
// which is far too heavy for a Worker and assumes a Node runtime.

const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

type Jwk = JsonWebKey & { kid: string; alg: string };
let jwkCache: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWK_TTL_MS = 60 * 60 * 1000; // 1 h — Google rotates these slowly

function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3;
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64UrlToJson<T>(s: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(s))) as T;
}

async function getJwks(): Promise<Jwk[]> {
  const now = Date.now();
  if (jwkCache && now - jwkCache.fetchedAt < JWK_TTL_MS) return jwkCache.keys;
  const res = await fetch(JWK_URL);
  if (!res.ok) throw new Error(`JWK fetch failed: ${res.status}`);
  const body = await res.json() as { keys: Jwk[] };
  jwkCache = { keys: body.keys, fetchedAt: now };
  return body.keys;
}

async function verifyFirebaseIdToken(token: string, projectId: string): Promise<boolean> {
  try {
    const [headerB64, payloadB64, signatureB64] = token.split('.');
    const header  = base64UrlToJson<{ alg: string; kid: string }>(headerB64);
    const payload = base64UrlToJson<{
      aud: string; iss: string; sub: string; exp: number; iat: number;
    }>(payloadB64);

    if (header.alg !== 'RS256' || !header.kid) return false;

    // Claims — must match this Firebase project, and be currently valid.
    const nowSec = Math.floor(Date.now() / 1000);
    const skew   = 60; // tolerate small clock drift
    if (payload.aud !== projectId) return false;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return false;
    if (!payload.sub) return false;
    if (payload.exp <= nowSec - skew) return false;
    if (payload.iat > nowSec + skew) return false;

    const jwk = (await getJwks()).find(k => k.kid === header.kid);
    if (!jwk) return false;

    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    return await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      base64UrlToBytes(signatureB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`),
    );
  } catch (e) {
    console.warn('Firebase ID token verification failed:', e);
    return false;
  }
}

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
