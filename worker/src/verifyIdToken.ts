// ─── Firebase ID token verification ──────────────────────────────────────────
// Firebase ID tokens are RS256 JWTs signed by Google. Verifying one means
// checking the signature against Google's published public keys, plus the
// standard claims. Done by hand rather than pulling in firebase-admin, which is
// far too heavy for a Worker and assumes a Node runtime.
//
// Split out of index.ts so the logic can be unit tested against a synthetic
// signing key — see test/verifyIdToken.test.ts.

const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export type Jwk = JsonWebKey & { kid: string; alg: string };

let jwkCache: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWK_TTL_MS = 60 * 60 * 1000; // 1 h — Google rotates these slowly

export function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64UrlToJson<T>(s: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(s))) as T;
}

export async function getGoogleJwks(): Promise<Jwk[]> {
  const now = Date.now();
  if (jwkCache && now - jwkCache.fetchedAt < JWK_TTL_MS) return jwkCache.keys;
  const res = await fetch(JWK_URL);
  if (!res.ok) throw new Error(`JWK fetch failed: ${res.status}`);
  const body = await res.json() as { keys: Jwk[] };
  jwkCache = { keys: body.keys, fetchedAt: now };
  return body.keys;
}

/**
 * True only for a currently-valid Firebase ID token issued to `projectId`.
 *
 * Malformed input needs no shape check up front: splitting a non-JWT yields too
 * few segments, the base64url decode throws, and the catch returns false. So an
 * opaque Google access token ("ya29.…") is rejected here rather than silently
 * taking some other path.
 *
 * `fetchJwks` is injectable so tests can supply a synthetic key; production
 * always uses Google's published set.
 */
export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
  fetchJwks: () => Promise<Jwk[]> = getGoogleJwks,
): Promise<boolean> {
  try {
    const [headerB64, payloadB64, signatureB64] = token.split('.');
    const header  = base64UrlToJson<{ alg: string; kid: string }>(headerB64);
    const payload = base64UrlToJson<{
      aud: string; iss: string; sub: string; exp: number; iat: number;
    }>(payloadB64);

    // Pin the algorithm before touching the signature. Without this, "none"
    // would skip verification and HS256 would let the *public* key be used as
    // an HMAC secret — the two classic JWT forgeries.
    if (header.alg !== 'RS256' || !header.kid) return false;

    // Claims — must match this Firebase project, and be currently valid.
    const nowSec = Math.floor(Date.now() / 1000);
    const skew   = 60; // tolerate small clock drift
    if (payload.aud !== projectId) return false;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return false;
    if (!payload.sub) return false;
    if (payload.exp <= nowSec - skew) return false;
    if (payload.iat > nowSec + skew) return false;

    const jwk = (await fetchJwks()).find(k => k.kid === header.kid);
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
