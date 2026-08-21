#!/usr/bin/env node
/**
 * KBC App — Full Firestore Reset
 *
 * Deletes every document in every app collection.
 * Firebase Auth users are NOT touched — delete them separately in the console.
 *
 * Requires Node 18+ (built-in fetch).
 * Run from the project root:  node scripts/reset-db.js
 */

const fs   = require('fs');
const path = require('path');
const rl   = require('readline');

// ─── Load .env ────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env        = loadEnv();
const PROJECT_ID = env['EXPO_PUBLIC_FIREBASE_PROJECT_ID'];
const API_KEY    = env['EXPO_PUBLIC_FIREBASE_API_KEY'];

if (!PROJECT_ID || !API_KEY) {
  console.error('Missing EXPO_PUBLIC_FIREBASE_PROJECT_ID or EXPO_PUBLIC_FIREBASE_API_KEY in .env');
  process.exit(1);
}

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ─── Firestore helpers ────────────────────────────────────────────────────────

async function listDocs(collection) {
  const docs = [];
  let pageToken = null;
  do {
    const url = `${BASE}/${collection}?key=${API_KEY}&pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res  = await fetch(url);
    const json = await res.json();
    if (json.documents) docs.push(...json.documents);
    pageToken = json.nextPageToken ?? null;
  } while (pageToken);
  return docs;
}

async function deleteDoc(name) {
  // name = "projects/.../databases/(default)/documents/<path>"
  const docPath = name.split('/documents/')[1];
  const res = await fetch(`${BASE}/${docPath}?key=${API_KEY}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    process.stdout.write(` [WARN: DELETE ${docPath} → ${res.status}]`);
  }
}

// ─── Per-collection reset ─────────────────────────────────────────────────────

async function resetFlat(collection) {
  process.stdout.write(`  ${collection} … `);
  const docs = await listDocs(collection);
  if (docs.length === 0) { console.log('(empty)'); return; }
  await Promise.all(docs.map(d => deleteDoc(d.name)));
  console.log(`deleted ${docs.length}`);
}

async function resetBoulders() {
  process.stdout.write(`  boulders … `);
  const docs = await listDocs('boulders');
  if (docs.length === 0) { console.log('(empty)'); return; }

  // Delete comments subcollection under each boulder first
  await Promise.all(docs.map(async d => {
    const id       = d.name.split('/').pop();
    const comments = await listDocs(`boulders/${id}/comments`);
    if (comments.length) await Promise.all(comments.map(c => deleteDoc(c.name)));
  }));

  await Promise.all(docs.map(d => deleteDoc(d.name)));
  console.log(`deleted ${docs.length}`);
}

// ─── Prompt helper ────────────────────────────────────────────────────────────

function ask(question) {
  const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => iface.question(question, ans => { iface.close(); resolve(ans); }));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n⚠   KBC App — Full Firestore Reset');
  console.log(`    Project : ${PROJECT_ID}`);
  console.log('    Scope   : boulderSeasons, boulders (+comments), climbLogs,');
  console.log('              climbLocations, personalProblems, users\n');
  console.log('    Firebase Auth users are NOT affected by this script.');
  console.log('    Delete them at:');
  console.log(`    https://console.firebase.google.com/project/${PROJECT_ID}/authentication/users\n`);

  const answer = await ask('Type  YES  to wipe all Firestore data: ');
  if (answer.trim() !== 'YES') {
    console.log('\nAborted — nothing was deleted.\n');
    process.exit(0);
  }

  console.log('\nDeleting…');

  await resetFlat('boulderSeasons');
  await resetBoulders();
  await resetFlat('climbLogs');
  await resetFlat('climbLocations');
  await resetFlat('personalProblems');
  await resetFlat('users');

  console.log('\n✅  Done. All Firestore data cleared.');
  console.log('    Remember to also delete Auth users if you want a truly clean slate.\n');
}

main().catch(e => { console.error('\n❌ ', e.message); process.exit(1); });
