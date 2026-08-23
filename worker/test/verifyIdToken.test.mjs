/**
 * Tests for the Worker's Firebase ID token verification.
 *
 *   cd worker && npm test
 *
 * Plain .mjs on Node's built-in test runner, importing the .ts source directly
 * via Node's type stripping — the Worker has no bundler or test framework of
 * its own and this needs neither.
 *
 * Two things are covered that are easy to get wrong and impossible to notice
 * when they break: the forgeries a JWT verifier must reject, and the fact that
 * an opaque Google access token is rejected rather than accepted. The Worker
 * used to accept those via Google's tokeninfo endpoint, which answers for any
 * valid token from any OAuth client — so any Google user could trade one for a
 * KBC admin calendar token.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyFirebaseIdToken, base64UrlToBytes, getGoogleJwks } from '../src/verifyIdToken.ts';

const PROJECT = 'kbc-app-3307b';
const KID = 'test-kid-1';

const { privateKey, publicKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify']);

const rawJwk = await crypto.subtle.exportKey('jwk', publicKey);
// same field set Google publishes: alg, e, kid, kty, n, use
const JWKS = [{ alg: 'RS256', e: rawJwk.e, kid: KID, kty: 'RSA', n: rawJwk.n, use: 'sig' }];
const jwks = async () => JWKS;

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

async function mint(header, payload, { tamper = false, hmac = false } = {}) {
  const h = b64u({ alg: 'RS256', kid: KID, ...header });
  const p = b64u(payload);
  const input = new TextEncoder().encode(`${h}.${p}`);
  let sig;
  if (hmac) {
    // algorithm confusion: HMAC the signing input with the public modulus
    const k = await crypto.subtle.importKey(
      'raw', Buffer.from(rawJwk.n, 'base64url'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    sig = await crypto.subtle.sign('HMAC', k, input);
  } else {
    sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, input);
  }
  const s = Buffer.from(sig).toString('base64url');
  // swap in a different payload after signing
  return tamper ? `${h}.${b64u({ ...payload, sub: 'attacker-uid' })}.${s}` : `${h}.${p}.${s}`;
}

const now = () => Math.floor(Date.now() / 1000);
const validClaims = () => ({
  aud: PROJECT,
  iss: `https://securetoken.google.com/${PROJECT}`,
  sub: 'uid-abc123',
  iat: now() - 30,
  exp: now() + 3600,
  auth_time: now() - 30,
  email: 'member@example.com',
  firebase: { sign_in_provider: 'google.com' },
});

test('accepts a genuine, well-formed token', async () => {
  assert.equal(await verifyFirebaseIdToken(await mint({}, validClaims()), PROJECT, jwks), true);
});

test('tolerates small clock drift on exp', async () => {
  const t = await mint({}, { ...validClaims(), exp: now() - 30 }); // inside the 60s skew
  assert.equal(await verifyFirebaseIdToken(t, PROJECT, jwks), true);
});

test('rejects forgeries', async (t) => {
  const cases = {
    'alg: none':                  [{ alg: 'none' }, validClaims(), {}],
    'alg: HS256 confusion':       [{ alg: 'HS256' }, validClaims(), { hmac: true }],
    'payload tampered post-sign': [{}, validClaims(), { tamper: true }],
    'unknown kid':                [{ kid: 'not-a-real-kid' }, validClaims(), {}],
    'header missing kid':         [{ kid: undefined }, validClaims(), {}],
  };
  for (const [name, [header, claims, opts]] of Object.entries(cases)) {
    await t.test(name, async () => {
      assert.equal(await verifyFirebaseIdToken(await mint(header, claims, opts), PROJECT, jwks), false);
    });
  }
});

test('rejects bad claims', async (t) => {
  const cases = {
    'expired 10 min ago':      { exp: now() - 600 },
    'iat far in the future':   { iat: now() + 600 },
    'aud = another project':   { aud: 'some-other-project' },
    'iss = another project':   { iss: 'https://securetoken.google.com/some-other-project' },
    'missing sub':             { sub: undefined },
  };
  for (const [name, override] of Object.entries(cases)) {
    await t.test(name, async () => {
      const tok = await mint({}, { ...validClaims(), ...override });
      assert.equal(await verifyFirebaseIdToken(tok, PROJECT, jwks), false);
    });
  }
});

test('rejects non-JWT credentials, including Google access tokens', async (t) => {
  for (const cred of ['ya29.a0AfH6SMBxxxxx', '', 'not-a-token', 'a.b', 'a.b.c.d', '....', 'Bearer']) {
    await t.test(JSON.stringify(cred), async () => {
      assert.equal(await verifyFirebaseIdToken(cred, PROJECT, jwks), false);
    });
  }
});

test('base64url decodes at every padding remainder', () => {
  for (const s of ['a', 'ab', 'abc', 'abcd', 'abcde', 'abcdef', 'abcdefg']) {
    const buf = Buffer.from(s, 'utf8');
    assert.deepEqual(Buffer.from(base64UrlToBytes(buf.toString('base64url'))), buf, s);
  }
});

// Networked: guards against Google changing the shape of its published keys in
// a way WebCrypto would reject. Skipped when offline rather than failing.
test("imports Google's live signing keys", { skip: !process.env.CI && undefined }, async () => {
  let keys;
  try {
    keys = await getGoogleJwks();
  } catch {
    return; // offline
  }
  assert.ok(keys.length > 0, 'expected at least one key');
  for (const k of keys) {
    await crypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }
});
