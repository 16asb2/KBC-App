#!/usr/bin/env node
/**
 * Read-only audit of the users collection. Writes nothing, deletes nothing.
 *
 * Run this before wipe-firestore.mjs: it tells you how many *distinct* members
 * you actually have, which is the number you should expect back after a
 * re-import. A total far above the distinct count means duplicates.
 *
 *   node scripts/inspect-users.mjs
 *
 * Credentials: same as wipe-firestore.mjs — GOOGLE_APPLICATION_CREDENTIALS or
 * --key <path>.
 */

import { readFileSync } from 'node:fs'

const PROJECT_ID = 'kbc-app-3307b'

const keyArg = process.argv.indexOf('--key')
const keyPath = keyArg >= 0 ? process.argv[keyArg + 1] : process.env.GOOGLE_APPLICATION_CREDENTIALS
if (!keyPath) {
  console.error('No credentials. Pass --key <service-account.json> or set GOOGLE_APPLICATION_CREDENTIALS.')
  process.exit(1)
}

const { cert, initializeApp } = await import('firebase-admin/app')
const { getFirestore } = await import('firebase-admin/firestore')

const key = JSON.parse(readFileSync(keyPath, 'utf8'))
if (key.project_id !== PROJECT_ID) {
  console.error(`That key is for project "${key.project_id}", not ${PROJECT_ID}. Refusing.`)
  process.exit(1)
}
initializeApp({ credential: cert(key), projectId: PROJECT_ID })
const db = getFirestore()

const byEmail = new Map()
let total = 0
let noEmail = 0
let imported = 0
let withPass = 0
let admins = 0
let waivers = 0
let linked = 0

let last = null
for (;;) {
  let q = db.collection('users').orderBy('__name__').limit(1000)
  if (last) q = q.startAfter(last)
  const snap = await q.get()
  if (snap.empty) break
  last = snap.docs[snap.docs.length - 1]
  for (const d of snap.docs) {
    total++
    if (d.get('importedAt')) imported++
    if (d.get('isAdmin') === true) admins++
    if (d.get('waiverLiability') || d.get('waiverPdfUrl')) waivers++
    if (d.get('linkedFrom')) linked++
    // Reads both the old and new field names, so this works either side of the
    // membershipStatus → membershipAccessPass rename.
    const pass = d.get('membershipAccessPass') ?? d.get('membershipStatus')
    if (pass && pass !== 'none' && pass !== 'inactive') withPass++
    const e = String(d.get('email') ?? '').toLowerCase().trim()
    if (!e) { noEmail++; continue }
    byEmail.set(e, (byEmail.get(e) ?? 0) + 1)
  }
  process.stdout.write(`\r  scanned ${total}…`)
}
process.stdout.write('\n\n')

const dupes = [...byEmail.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1])

console.log(`total documents             ${String(total).padStart(6)}`)
console.log(`distinct emails             ${String(byEmail.size).padStart(6)}  ← expect roughly this many back`)
console.log(`documents with no email     ${String(noEmail).padStart(6)}`)
console.log(`emails appearing 2+ times   ${String(dupes.length).padStart(6)}`)
console.log(`surplus copies              ${String(total - byEmail.size - noEmail).padStart(6)}`)
console.log('')
console.log(`carry importedAt            ${String(imported).padStart(6)}`)
console.log(`hold some access pass       ${String(withPass).padStart(6)}`)
console.log(`isAdmin                     ${String(admins).padStart(6)}`)
console.log(`have a waiver on file       ${String(waivers).padStart(6)}  ← NOT re-importable, see below`)
console.log(`linked to a Google account  ${String(linked).padStart(6)}`)

if (dupes.length) {
  console.log('\nmost-duplicated emails (copies each, addresses masked):')
  for (const [e, n] of dupes.slice(0, 10)) {
    console.log(`  ${String(n).padStart(5)}  ${e.replace(/^(.).*?(.?@)/, '$1***$2')}`)
  }
}

if (waivers > 0) {
  console.log(
    `\n  ${waivers} member(s) have a signed waiver stored on their profile.\n` +
    '  No CSV column carries a waiver, so wiping users/ loses them and those\n' +
    '  members will be asked to sign again. Export the member PDF from the\n' +
    '  admin panel first if you need a record.',
  )
}
process.exit(0)
