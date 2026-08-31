#!/usr/bin/env node
/**
 * Deletes Firestore collections in the KBC project, so a clean re-import can
 * replace them.
 *
 * This destroys production data and there is no undo. Everything here is built
 * around that: it does nothing unless told exactly what to delete, it prints
 * what it would do and stops unless `--confirm` is passed, and even then it
 * makes you type the project id before it touches anything.
 *
 *   # see what is there — this is the default, it deletes nothing
 *   node scripts/wipe-firestore.mjs --collections users,logs
 *
 *   # actually delete, keeping your own admin record so you can still sign in
 *   node scripts/wipe-firestore.mjs --collections users,logs --confirm \
 *     --keep-email kingstonboulderingcooperative@gmail.com
 *
 * Credentials: point GOOGLE_APPLICATION_CREDENTIALS at a service-account JSON
 * for kbc-app-3307b, or pass --key <path>. Set FIRESTORE_EMULATOR_HOST to
 * rehearse against the emulator instead of the live project.
 *
 * Install once:  cd scripts && npm install
 */

import { createInterface } from 'node:readline/promises'
import { readFileSync } from 'node:fs'
import { stdin, stdout } from 'node:process'
import { pathToFileURL } from 'node:url'

const PROJECT_ID = 'kbc-app-3307b'

/**
 * Every top-level collection the rules define. Naming one that isn't here is an
 * error rather than a new collection — a typo would otherwise "succeed" by
 * deleting nothing and leave you believing the data was gone.
 *
 * `subcollections` matters: deleting a document in Firestore does NOT delete
 * anything nested under it, so those need a recursive delete or the children
 * survive as unreachable orphans.
 */
const COLLECTIONS = {
  users: { subcollections: [], note: 'member profiles — re-importable from the Members tab' },
  logs: { subcollections: [], note: 'sign-in book + purchases — purchases re-importable' },
  boulders: { subcollections: ['comments'], note: 'climbs — NOT re-importable from any CSV' },
  boulderSeasons: { subcollections: [], note: 'seasons — NOT re-importable' },
  climbLogs: { subcollections: [], note: "members' personal climb logs — NOT re-importable" },
  climbLocations: { subcollections: [], note: 'gym/outdoor locations — NOT re-importable' },
  personalProblems: { subcollections: [], note: 'member-created problems — NOT re-importable' },
  gymStatus: { subcollections: [], note: 'open/closed status — NOT re-importable' },
  boulderConfig: { subcollections: [], note: 'grade/badge config — NOT re-importable' },
  userBoulderData: { subcollections: [], note: 'per-member boulder state — NOT re-importable' },
}

/** Collections whose documents are keyed by, or point at, a member's uid. */
const UID_LINKED = ['logs', 'climbLogs', 'personalProblems', 'userBoulderData']

function parseArgs(argv) {
  const args = { collections: [], keepEmails: [], confirm: false, key: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--collections') args.collections = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--keep-email') args.keepEmails.push((argv[++i] ?? '').trim().toLowerCase())
    else if (a === '--key') args.key = argv[++i]
    else if (a === '--confirm') args.confirm = true
    else if (a === '--help' || a === '-h') args.help = true
    else throw new Error(`Unknown argument: ${a}`)
  }
  return args
}

function usage() {
  console.log(`
Wipe Firestore collections in ${PROJECT_ID}.

  --collections a,b     which collections to delete (required)
  --confirm             actually delete; without it this is a dry run
  --keep-email <email>  keep matching docs in 'users' (repeatable)
  --key <path>          service-account JSON (or set GOOGLE_APPLICATION_CREDENTIALS)

Known collections:
${Object.entries(COLLECTIONS).map(([n, c]) => `  ${n.padEnd(18)} ${c.note}`).join('\n')}
`)
}

async function countCollection(db, name) {
  const snap = await db.collection(name).count().get()
  return snap.data().count
}

/**
 * Deletes documents one page at a time. Used when some documents are being
 * kept, which `recursiveDelete` cannot express.
 */
async function deleteFiltered(db, name, shouldKeep) {
  let deleted = 0
  let kept = 0
  let last = null
  for (;;) {
    let q = db.collection(name).orderBy('__name__').limit(400)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break
    last = snap.docs[snap.docs.length - 1]
    const batch = db.batch()
    let inBatch = 0
    for (const d of snap.docs) {
      if (shouldKeep(d)) { kept++; continue }
      batch.delete(d.ref)
      inBatch++
    }
    if (inBatch) {
      await batch.commit()
      deleted += inBatch
    }
    process.stdout.write(`\r  ${name}: deleted ${deleted}${kept ? `, kept ${kept}` : ''}…`)
  }
  process.stdout.write('\n')
  return { deleted, kept }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args.collections.length === 0) {
    usage()
    process.exit(args.help ? 0 : 1)
  }

  const unknown = args.collections.filter((c) => !(c in COLLECTIONS))
  if (unknown.length) {
    console.error(`Unknown collection(s): ${unknown.join(', ')}`)
    console.error(`Known: ${Object.keys(COLLECTIONS).join(', ')}`)
    process.exit(1)
  }

  // Loaded here, not at the top: --help and every argument check above should
  // work on a clean checkout, before anyone has run `npm install`.
  const { cert, initializeApp } = await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')

  const emulator = process.env.FIRESTORE_EMULATOR_HOST
  if (emulator) {
    console.log(`Using the Firestore emulator at ${emulator} — the live project is not touched.`)
    initializeApp({ projectId: PROJECT_ID })
  } else {
    const keyPath = args.key ?? process.env.GOOGLE_APPLICATION_CREDENTIALS
    if (!keyPath) {
      console.error('No credentials. Pass --key <service-account.json> or set GOOGLE_APPLICATION_CREDENTIALS.')
      process.exit(1)
    }
    const key = JSON.parse(readFileSync(keyPath, 'utf8'))
    if (key.project_id !== PROJECT_ID) {
      console.error(`That key is for project "${key.project_id}", not ${PROJECT_ID}. Refusing.`)
      process.exit(1)
    }
    initializeApp({ credential: cert(key), projectId: PROJECT_ID })
  }

  const db = getFirestore()

  console.log(`\nProject: ${PROJECT_ID}${emulator ? ' (emulator)' : '  ← LIVE'}`)
  console.log('About to consider:\n')
  let total = 0
  for (const name of args.collections) {
    const n = await countCollection(db, name)
    total += n
    const meta = COLLECTIONS[name]
    const subs = meta.subcollections.length ? `  (+ nested ${meta.subcollections.join(', ')})` : ''
    console.log(`  ${name.padEnd(18)} ${String(n).padStart(6)} docs${subs}`)
    console.log(`  ${' '.repeat(18)} ${meta.note}`)
  }

  if (args.keepEmails.length) {
    console.log(`\nKeeping in 'users': ${args.keepEmails.join(', ')}`)
  } else if (args.collections.includes('users')) {
    console.log(
      '\n  Warning: no --keep-email given, so every member profile goes, including\n' +
      "  the admin records that grant access to the panel. The super-admin account is\n" +
      '  hard-coded in firestore.rules and admin-web, so it keeps working — anyone\n' +
      '  else is locked out until re-imported as an admin.',
    )
  }

  const orphaning = args.collections.includes('users')
    ? UID_LINKED.filter((c) => !args.collections.includes(c))
    : []
  if (orphaning.length) {
    console.log(
      `\n  Note: wiping 'users' without ${orphaning.join(', ')} leaves those records\n` +
      '  pointing at member ids that no longer exist.',
    )
  }

  if (!args.confirm) {
    console.log(`\nDry run — nothing was deleted. ${total} document(s) matched.`)
    console.log('Re-run with --confirm to delete.')
    return
  }

  const phrase = `DELETE ${PROJECT_ID}`
  const rl = createInterface({ input: stdin, output: stdout })
  const typed = await rl.question(`\nThis permanently deletes ${total} document(s). Type "${phrase}" to proceed: `)
  rl.close()
  if (typed.trim() !== phrase) {
    console.log('Did not match. Nothing was deleted.')
    process.exit(1)
  }

  console.log('')
  for (const name of args.collections) {
    const meta = COLLECTIONS[name]
    const keeping = name === 'users' && args.keepEmails.length > 0
    if (keeping) {
      const { deleted, kept } = await deleteFiltered(db, name, (d) =>
        args.keepEmails.includes(String(d.get('email') ?? '').toLowerCase().trim()),
      )
      console.log(`  ${name}: ${deleted} deleted, ${kept} kept`)
    } else {
      // recursiveDelete also clears nested subcollections, which a plain
      // document delete would strand.
      await db.recursiveDelete(db.collection(name))
      console.log(`  ${name}: deleted${meta.subcollections.length ? ' (including nested docs)' : ''}`)
    }
  }
  console.log('\nDone. Re-import from the admin panel when ready.')
}

// Only when run directly, so the pieces below can be imported and tested
// without the script deleting anything on import.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('\nFailed:', e.message)
    process.exit(1)
  })
}

export { COLLECTIONS, deleteFiltered, parseArgs }
