#!/usr/bin/env node
/**
 * Move base64 photos out of the documents that list them.
 *
 * A picture in this app is a base64 JPEG data URI, and it used to be a field:
 * `boulders/{id}.photo` and `climbLogs/{id}.photo`. A field is downloaded by
 * every query that touches the collection, and the Boulders tab reads both
 * collections whole — a season of problems, and every KBC climb ever logged —
 * so it was pulling down megabytes of pictures it never draws. That is most of
 * why the app crawled on iPhone, whose memory ceiling is far below Android
 * Chrome's. See DESIGN.md.
 *
 * The app now keeps a photo in `<collection>/{id}/media/main`, which a query on
 * the parent does not return. It reads both shapes, so nothing breaks before
 * this runs; this is what stops the old bytes shipping.
 *
 * For each document with a non-empty `photo`, this:
 *   1. writes `<collection>/{id}/media/main` — `{ photo, updatedAt }`, plus
 *      `uid` for climbLogs, which `firestore.rules` needs to tell the owner
 *      from everybody else,
 *   2. sets `hasPhoto: true` on the parent, which is how the app knows a fetch
 *      is worth making,
 *   3. deletes the parent's `photo` field.
 *
 * Step 3 is what actually reclaims anything, and it is the irreversible one.
 * `--keep-field` stops after step 2, which leaves both copies in place: the app
 * behaves identically and you can verify before committing. Running again after
 * that finishes the job — each step is idempotent and re-running is safe.
 *
 *   node migrate-photos.mjs                          # dry run, both collections
 *   node migrate-photos.mjs --collections boulders
 *   node migrate-photos.mjs --confirm --keep-field   # copy, keep the original
 *   node migrate-photos.mjs --confirm                # copy and drop the original
 *
 * Credentials: same as the other scripts — GOOGLE_APPLICATION_CREDENTIALS or
 * --key <path>. See README.md.
 */

import { readFileSync } from 'node:fs'

const PROJECT_ID = 'kbc-app-3307b'
const MIGRATABLE = ['boulders', 'climbLogs']

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const flag = (name) => process.argv.includes(`--${name}`)

const confirm = flag('confirm')
const keepField = flag('keep-field')

const collections = (arg('collections') ?? MIGRATABLE.join(',')).split(',').map((c) => c.trim()).filter(Boolean)
const unknown = collections.filter((c) => !MIGRATABLE.includes(c))
if (unknown.length) {
  // A typo would otherwise "succeed" by migrating nothing and leave you
  // believing the photos had moved.
  console.error(`Not a collection this script knows how to migrate: ${unknown.join(', ')}`)
  console.error(`Known: ${MIGRATABLE.join(', ')}`)
  process.exit(1)
}

const keyPath = arg('key') ?? process.env.GOOGLE_APPLICATION_CREDENTIALS
const emulator = process.env.FIRESTORE_EMULATOR_HOST
if (!keyPath && !emulator) {
  console.error('No credentials. Pass --key <service-account.json> or set GOOGLE_APPLICATION_CREDENTIALS.')
  process.exit(1)
}

const { cert, initializeApp } = await import('firebase-admin/app')
const { getFirestore, FieldValue } = await import('firebase-admin/firestore')

if (keyPath) {
  const key = JSON.parse(readFileSync(keyPath, 'utf8'))
  if (key.project_id !== PROJECT_ID) {
    console.error(`That key is for project "${key.project_id}", not ${PROJECT_ID}. Refusing.`)
    process.exit(1)
  }
  initializeApp({ credential: cert(key), projectId: PROJECT_ID })
} else {
  console.log(`Using the emulator at ${emulator}.\n`)
  initializeApp({ projectId: PROJECT_ID })
}
const db = getFirestore()

function kb(bytes) {
  return `${(bytes / 1024).toFixed(0)} kB`
}

async function migrate(collectionId) {
  const snap = await db.collection(collectionId).get()
  const withPhoto = snap.docs.filter((d) => {
    const p = d.get('photo')
    return typeof p === 'string' && p.length > 0
  })

  const bytes = withPhoto.reduce((sum, d) => sum + d.get('photo').length, 0)
  console.log(`${collectionId}: ${snap.size} documents, ${withPhoto.length} carrying a photo (${kb(bytes)} total)`)

  if (!withPhoto.length) return { moved: 0, bytes: 0 }

  const biggest = [...withPhoto].sort((a, b) => b.get('photo').length - a.get('photo').length).slice(0, 3)
  for (const d of biggest) {
    const label = collectionId === 'boulders' ? `#${d.get('number') ?? '?'} ${d.get('name') ?? ''}` : (d.get('name') ?? d.id)
    console.log(`   largest: ${kb(d.get('photo').length)}  ${label.trim() || d.id}`)
  }

  if (!confirm) {
    console.log(`   dry run — nothing written. Pass --confirm to move them.\n`)
    return { moved: 0, bytes }
  }

  let moved = 0
  for (const d of withPhoto) {
    const photo = d.get('photo')
    const media = { photo, updatedAt: new Date().toISOString() }
    // climbLogs media is owner-gated, and the rules read the owner off the
    // media document itself rather than paying to fetch the parent.
    if (collectionId === 'climbLogs') media.uid = d.get('uid') ?? ''

    await d.ref.collection('media').doc('main').set(media)
    await d.ref.update({
      hasPhoto: true,
      ...(keepField ? {} : { photo: FieldValue.delete() }),
    })
    moved++
    if (moved % 25 === 0) console.log(`   … ${moved}/${withPhoto.length}`)
  }

  console.log(
    keepField
      ? `   copied ${moved}; the original field is still there (--keep-field). Re-run without it to reclaim ${kb(bytes)}.\n`
      : `   moved ${moved}, reclaiming ${kb(bytes)} from every read of this collection.\n`,
  )
  return { moved, bytes }
}

console.log(
  confirm
    ? keepField
      ? 'Copying photos into media subdocuments, keeping the originals.\n'
      : 'Moving photos into media subdocuments and deleting the originals.\n'
    : 'Dry run. Nothing will be written.\n',
)

let totalMoved = 0
let totalBytes = 0
for (const c of collections) {
  const r = await migrate(c)
  totalMoved += r.moved
  totalBytes += r.bytes
}

if (!confirm) {
  console.log(`Would move ${totalBytes ? kb(totalBytes) : 'nothing'} out of the documents above.`)
  console.log('Re-run with --confirm (add --keep-field to copy without deleting).')
} else {
  console.log(`Done. ${totalMoved} photo${totalMoved === 1 ? '' : 's'} migrated.`)
  if (!keepField) console.log('Deploy the current app before or with this — older builds read only the field.')
}
