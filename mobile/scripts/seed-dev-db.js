#!/usr/bin/env node
/**
 * KBC App — Dev Database Seeder
 * Seeds kbc-app-dev with a user profile (admin + active), a boulder season, and test boulders.
 * Run from project root: node scripts/seed-dev-db.js
 */

const fs   = require('fs');
const path = require('path');

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

// Allow --project and --key CLI overrides
const args = process.argv.slice(2);
function argVal(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

const env        = loadEnv();
const PROJECT_ID = argVal('--project') || env['EXPO_PUBLIC_FIREBASE_PROJECT_ID'];
const API_KEY    = argVal('--key')     || env['EXPO_PUBLIC_FIREBASE_API_KEY'];

if (!PROJECT_ID || !API_KEY) {
  console.error('Missing EXPO_PUBLIC_FIREBASE_PROJECT_ID or EXPO_PUBLIC_FIREBASE_API_KEY in .env');
  process.exit(1);
}

const BASE      = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const QUERY_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;

// ─── Firestore helpers ────────────────────────────────────────────────────────
function encodeVal(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number')  return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === 'string')  return { stringValue: val };
  if (Array.isArray(val))       return { arrayValue: { values: val.map(encodeVal) } };
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) fields[k] = encodeVal(v);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function encodeDoc(data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) fields[k] = encodeVal(v);
  return { fields };
}

function decodeVal(fval) {
  if (!fval) return null;
  if ('stringValue'  in fval) return fval.stringValue;
  if ('booleanValue' in fval) return fval.booleanValue;
  if ('integerValue' in fval) return parseInt(fval.integerValue, 10);
  if ('doubleValue'  in fval) return fval.doubleValue;
  if ('nullValue'    in fval) return null;
  if ('arrayValue'   in fval) return (fval.arrayValue.values ?? []).map(decodeVal);
  if ('mapValue'     in fval) {
    const out = {};
    for (const [k, v] of Object.entries(fval.mapValue.fields ?? {})) out[k] = decodeVal(v);
    return out;
  }
  return null;
}

function decodeDoc(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc.fields ?? {})) out[k] = decodeVal(v);
  return out;
}

async function fsPatch(docPath, data, mask) {
  let url = `${BASE}/${docPath}?key=${API_KEY}`;
  if (mask) url += mask.map(f => `&updateMask.fieldPaths=${encodeURIComponent(f)}`).join('');
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encodeDoc(data)),
  });
  if (!res.ok) throw new Error(`PATCH ${docPath} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fsPost(col, data) {
  const res = await fetch(`${BASE}/${col}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encodeDoc(data)),
  });
  if (!res.ok) throw new Error(`POST ${col} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fsQuery(query) {
  const res = await fetch(QUERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: query }),
  });
  if (!res.ok) throw new Error(`Query → ${res.status}: ${await res.text()}`);
  const results = await res.json();
  return results.filter(r => r.document);
}

// ─── ID helper ────────────────────────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const ADMIN_EMAIL = '16asb2@gmail.com';
  const now = new Date().toISOString();

  console.log(`\n🌱  KBC Dev DB Seeder`);
  console.log(`    Project: ${PROJECT_ID}\n`);

  // ── 1. Find or warn about user profile ────────────────────────────────────
  console.log('1. Looking for user profile...');

  // Debug: list all users to see what's in the collection
  const allUsersRes = await fetch(`${BASE}/users?key=${API_KEY}&pageSize=10`);
  const allUsersJson = await allUsersRes.json();
  const allDocs = allUsersJson.documents ?? [];
  console.log(`   ℹ  Total docs in users collection: ${allDocs.length}`);
  if (allDocs.length > 0) {
    for (const d of allDocs) {
      const uid = d.name.split('/').pop();
      const data = decodeDoc(d);
      console.log(`      - uid=${uid}  email=${data.email}  name=${data.name}`);
    }
  }

  const userDocs = await fsQuery({
    from: [{ collectionId: 'users' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'email' },
        op: 'EQUAL',
        value: { stringValue: ADMIN_EMAIL },
      },
    },
    limit: 1,
  });

  if (userDocs.length === 0) {
    console.log(`   ⚠  No user profile found for ${ADMIN_EMAIL}.`);
    if (allDocs.length === 0) {
      console.log(`   The users collection is completely empty — the app's Firestore calls`);
      console.log(`   may be hitting the wrong project, or profile creation failed silently.`);
    }
    console.log(`   Sign in to the app first so the profile is auto-created, then re-run this script.`);
    process.exit(0);
  }

  const userDoc  = userDocs[0].document;
  const uid      = userDoc.name.split('/').pop();
  const userData = decodeDoc(userDoc);

  const updates = {
    membershipStatus: 'active',
    isAdmin: true,
    isSupervisor: true,
    memberSince: userData.memberSince || now,
    membershipStart: userData.membershipStart || now,
    membershipExpiry: '2030-12-31T00:00:00.000Z',
    punchPassRemaining: 0,
    lastUpdatedAt: now,
    lastUpdatedBy: 'seed-script',
  };
  const mask = Object.keys(updates);
  await fsPatch(`users/${uid}`, updates, mask);
  console.log(`   ✅ Profile updated — ${ADMIN_EMAIL} is now active admin + supervisor`);

  // ── 2. Create boulder season ───────────────────────────────────────────────
  console.log('\n2. Creating boulder season...');
  const seasonDocs = await fsQuery({
    from: [{ collectionId: 'boulderSeasons' }],
    limit: 1,
  });

  let seasonId;
  if (seasonDocs.length > 0) {
    seasonId = seasonDocs[0].document.name.split('/').pop();
    console.log(`   ℹ  Season already exists (${seasonId}) — skipping`);
  } else {
    const seasonDoc = await fsPost('boulderSeasons', {
      name: 'Test Season 2026',
      startDate: '2026-05-01',
      endDate: '2026-08-31',
      active: true,
      createdAt: now,
    });
    seasonId = seasonDoc.name.split('/').pop();
    console.log(`   ✅ Created season "Test Season 2026" (${seasonId})`);
  }

  // ── 3. Create test boulders ────────────────────────────────────────────────
  console.log('\n3. Creating test boulders...');
  const existingBoulders = await fsQuery({
    from: [{ collectionId: 'boulders' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'seasonId' },
        op: 'EQUAL',
        value: { stringValue: seasonId },
      },
    },
    limit: 1,
  });

  if (existingBoulders.length > 0) {
    console.log(`   ℹ  Boulders already exist for this season — skipping`);
  } else {
    const testBoulders = [
      { number: 1, name: 'Warmup Wall',   grade: 'White',  setter: 'Artur', description: 'Easy warmup slab, good for beginners.' },
      { number: 2, name: 'Crimp King',    grade: 'Yellow', setter: 'Artur', description: 'Crimpy face climbing, watch your skin.' },
      { number: 3, name: 'Sloper Fest',   grade: 'Green',  setter: 'Artur', description: 'All slopers, no pinches allowed.' },
      { number: 4, name: 'Power Enduro',  grade: 'Blue',   setter: 'Artur', description: 'Long sequence on jugs, pump city.' },
      { number: 5, name: 'Project Fear',  grade: 'Red',    setter: 'Artur', description: 'Scary heel hook crux at the top.' },
    ];

    for (const b of testBoulders) {
      const internalId = generateId();
      await fsPost('boulders', {
        seasonId,
        number: b.number,
        name: b.name,
        grade: b.grade,
        setter: b.setter,
        description: b.description,
        locations: [],
        internalId,
        local: 'KBC',
        area: 'Boulders',
        permissions: { view: 'members', edit: 'admin' },
        createdAt: now,
        updatedAt: now,
      });
      console.log(`   ✅ Boulder #${b.number} — ${b.name} (${b.grade})`);
    }
  }

  console.log(`\n✅  Done! Reload the app and sign in.\n`);
}

main().catch(e => { console.error('\n❌ ', e.message); process.exit(1); });
