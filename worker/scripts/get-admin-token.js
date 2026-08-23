/**
 * One-time script to mint a Google OAuth refresh token for the KBC admin
 * account, which the Worker exchanges for short-lived Calendar access tokens.
 *
 *   node worker/scripts/get-admin-token.js <DESKTOP_CLIENT_ID> <DESKTOP_CLIENT_SECRET>
 *
 * The client ID and secret come from Google Cloud Console → Credentials →
 * Create Credentials → OAuth 2.0 Client ID → Application type: Desktop app.
 * Desktop clients accept any localhost port without registering exact redirect
 * URIs, which is why this can listen on 3000 and just work.
 *
 * Ported from mobile/scripts/get-admin-token.js (see 1cdfada), with two changes:
 * it asks for a read-only scope, and it prints the token rather than writing it
 * into a .env — the Worker keeps its secrets in Cloudflare, and writing a live
 * refresh token to disk is how those end up committed by accident.
 */

const http = require('http');

const CLIENT_ID     = process.argv[2];
const CLIENT_SECRET = process.argv[3];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Usage: node worker/scripts/get-admin-token.js <CLIENT_ID> <CLIENT_SECRET>');
  console.error('');
  console.error('Create a NEW OAuth client for this — Google Cloud Console →');
  console.error('APIs & Services → Credentials → Create Credentials → OAuth client');
  console.error('ID → Application type: Desktop app. Copy the secret from the dialog');
  console.error('or download the JSON: Google reveals it only at creation, so the');
  console.error('secret of the existing client cannot be read back. Cloudflare Worker');
  console.error('secrets are write-only too (`wrangler secret list` shows names only).');
  console.error('');
  console.error('A refresh token is bound to the client that issued it, so rotating');
  console.error('the client means rotating all three Worker secrets together:');
  console.error('  GOOGLE_ADMIN_CLIENT_ID, GOOGLE_ADMIN_CLIENT_SECRET,');
  console.error('  GOOGLE_ADMIN_REFRESH_TOKEN');
  console.error('Set only some of them and the exchange fails with invalid_client.');
  console.error('');
  console.error('Check the OAuth consent screen is "In production", not "Testing" —');
  console.error('Google revokes testing-mode refresh tokens after 7 days.');
  process.exit(1);
}

const PORT         = 3000;
const REDIRECT_URI = `http://localhost:${PORT}`;

// Which Calendar scope to request. `events` permits creating, editing and
// deleting; `readonly` cannot. Pass it as the third argument:
//
//   node worker/scripts/get-admin-token.js <ID> <SECRET> readonly
//
// Defaults to `events` because the Schedule tab creates and edits sessions —
// with `readonly` every write fails at 403 insufficientPermissions. Use
// `readonly` only if those write features are removed again.
const SCOPE_ARG = (process.argv[4] ?? 'events').toLowerCase();
const SCOPES = {
  events: 'https://www.googleapis.com/auth/calendar.events',
  readonly: 'https://www.googleapis.com/auth/calendar.readonly',
};
if (!SCOPES[SCOPE_ARG]) {
  console.error(`Unknown scope "${SCOPE_ARG}". Use "events" or "readonly".`);
  process.exit(1);
}
const SCOPE = SCOPES[SCOPE_ARG];

const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id:     CLIENT_ID,
  redirect_uri:  REDIRECT_URI,
  response_type: 'code',
  scope:         SCOPE,
  access_type:   'offline',
  prompt:        'consent',  // force a fresh refresh_token even if already consented
}).toString();

console.log('\n=== KBC admin token generator (calendar.readonly) ===\n');
console.log('Open this URL and sign in as the KBC admin account:\n');
console.log(authUrl + '\n');

let handled = false;

const server = http.createServer(async (req, res) => {
  const url   = new URL(req.url, REDIRECT_URI);
  const code  = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  // The browser also asks for /favicon.ico and friends; ignore anything that
  // isn't the actual callback.
  if (!code && !error) { res.writeHead(200); res.end(); return; }
  if (handled)         { res.writeHead(200); res.end(); return; }
  handled = true;
  server.close();

  if (error || !code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h2>Error: ${error}</h2><p>Close this tab and check the terminal.</p>`);
    console.error('\nGoogle returned an error:', error);
    process.exit(1);
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h2>Authorization successful — you can close this tab.</h2>');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    }).toString(),
  });

  const data = await tokenRes.json();
  if (!tokenRes.ok || !data.refresh_token) {
    console.error('\nToken exchange failed:');
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('=== SUCCESS ===\n');
  console.log('Granted scope:', data.scope);
  console.log('\nRefresh token:\n');
  console.log('  ' + data.refresh_token);
  console.log('\nSet all three Worker secrets — each prompts for a value. The');
  console.log('refresh token only works with the client that issued it, so the ID');
  console.log('and secret must be the ones passed to this script:\n');
  console.log('  cd worker');
  console.log('  npx wrangler secret put GOOGLE_ADMIN_CLIENT_ID');
  console.log('  npx wrangler secret put GOOGLE_ADMIN_CLIENT_SECRET');
  console.log('  npx wrangler secret put GOOGLE_ADMIN_REFRESH_TOKEN\n');
  console.log('Confirm the calendar still loads before cleaning up. Once it does,');
  console.log('revoke the old write-scoped grant so it stops working:\n');
  console.log('  https://myaccount.google.com/permissions\n');
  process.exit(0);
});

server.listen(PORT, () => console.log(`Waiting for the callback on ${REDIRECT_URI} …\n`));
