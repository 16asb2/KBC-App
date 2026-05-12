/**
 * One-time script to obtain a Google OAuth refresh token for the KBC super-admin account.
 *
 * Usage:
 *   node scripts/get-admin-token.js <DESKTOP_CLIENT_ID> <DESKTOP_CLIENT_SECRET>
 *
 * The Desktop app client ID and secret come from:
 *   Google Cloud Console → Credentials → Create Credentials
 *   → OAuth 2.0 Client ID → Application type: Desktop app
 *
 * Desktop app clients allow any localhost port without registering exact redirect URIs.
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const DESKTOP_CLIENT_ID     = process.argv[2];
const DESKTOP_CLIENT_SECRET = process.argv[3];

if (!DESKTOP_CLIENT_ID || !DESKTOP_CLIENT_SECRET) {
  console.error('Usage: node scripts/get-admin-token.js <CLIENT_ID> <CLIENT_SECRET>');
  console.error('');
  console.error('Create a Desktop app OAuth client in Google Cloud Console:');
  console.error('  Credentials → + Create Credentials → OAuth 2.0 Client ID → Desktop app');
  process.exit(1);
}

const PORT         = 3000;
const REDIRECT_URI = `http://localhost:${PORT}`;
const SCOPE        = 'https://www.googleapis.com/auth/calendar.events';

const authParams = new URLSearchParams({
  client_id:     DESKTOP_CLIENT_ID,
  redirect_uri:  REDIRECT_URI,
  response_type: 'code',
  scope:         SCOPE,
  access_type:   'offline',
  prompt:        'consent',
});

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${authParams.toString()}`;

console.log('\n=== KBC Admin Token Generator ===\n');
console.log('Open this URL in a browser and sign in as the KBC super-admin account:\n');
console.log(authUrl);
console.log('');

let handled = false;

const server = http.createServer(async (req, res) => {
  const url   = new URL(req.url, `http://localhost:${PORT}`);
  const code  = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  // Ignore secondary browser requests (favicon, etc.) that have no code or error
  if (!code && !error) {
    res.writeHead(200);
    res.end();
    return;
  }

  // Only process the first real callback
  if (handled) { res.writeHead(200); res.end(); return; }
  handled = true;
  server.close();

  if (error || !code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h2>Error: ${error}</h2><p>Close this tab and check the terminal.</p>`);
    console.error('\nGoogle returned an error:', error);
    process.exit(1);
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h2>Authorization successful! You can close this tab.</h2>');
  server.close();

  console.log('Authorization code received. Exchanging for tokens...\n');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     DESKTOP_CLIENT_ID,
        client_secret: DESKTOP_CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      }).toString(),
    });

    const data = await tokenRes.json();

    if (!tokenRes.ok || !data.refresh_token) {
      console.error('Token exchange failed:');
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }

    // Read current .env and append the token
    const envPath    = path.join(__dirname, '..', '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');

    // Update or append EXPO_PUBLIC_GOOGLE_ADMIN_REFRESH_TOKEN
    const updated = envContent.includes('EXPO_PUBLIC_GOOGLE_ADMIN_REFRESH_TOKEN')
      ? envContent.replace(
          /EXPO_PUBLIC_GOOGLE_ADMIN_REFRESH_TOKEN=.*/,
          `EXPO_PUBLIC_GOOGLE_ADMIN_REFRESH_TOKEN=${data.refresh_token}`,
        )
      : envContent + `\nEXPO_PUBLIC_GOOGLE_ADMIN_REFRESH_TOKEN=${data.refresh_token}\n`;

    fs.writeFileSync(envPath, updated);

    console.log('=== SUCCESS ===\n');
    console.log('.env updated automatically with:');
    console.log(`EXPO_PUBLIC_GOOGLE_ADMIN_REFRESH_TOKEN=${data.refresh_token}`);
    console.log('');
    console.log('NOTE: The DESKTOP client ID/secret used here are only for this one-time');
    console.log('      token generation — they are NOT needed in the app.');
    console.log('      The app uses EXPO_PUBLIC_GOOGLE_CLIENT_SECRET (web client) to');
    console.log('      refresh the admin token at runtime.');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Waiting for Google redirect on http://localhost:${PORT} ...`);
  console.log('(sign in and approve, the browser will redirect here automatically)\n');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\nERROR: Port ${PORT} is already in use. Close it and retry.`);
  } else {
    console.error('Server error:', e.message);
  }
  process.exit(1);
});
