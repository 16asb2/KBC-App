#!/usr/bin/env node
/**
 * Read-only audit of the boulders collection. Writes nothing, deletes nothing.
 *
 * It exists because a rendered count cannot be argued with. The Boulder Summary
 * builds its grade × wall table out of four stored fields, and when a boulder
 * does not appear where somebody expects it, the question is always the same:
 * is the table wrong, or is the record? This prints the fields as they are
 * actually stored — locations as JSON, so a trailing space or a lower-case
 * spelling is visible rather than inferred — and then rebuilds the same table
 * beside them.
 *
 *   node inspect-boulders.mjs                     # list the seasons
 *   node inspect-boulders.mjs --season F2026      # by name or id
 *   node inspect-boulders.mjs --season F2026 --grade Black
 *   node inspect-boulders.mjs --season F2026 --wall "Yellow Wall"
 *
 * Credentials: same as inspect-users.mjs — GOOGLE_APPLICATION_CREDENTIALS or
 * --key <path>. See README.md.
 */

import { readFileSync } from 'node:fs'

const PROJECT_ID = 'kbc-app-3307b'

// Kept in step with web/src/services/boulders.ts. If these ever disagree with
// the app, the app is right and this file is stale.
const GRADES = ['White', 'Blue', 'Purple', 'Pink', 'Black']
const LOCATIONS = [
  'Cave Right',
  'Cave Middle',
  'Cave Left',
  'Green Wall',
  'Blue Wall',
  'Yellow Wall',
]
const UNGRADED = 'Ungraded'
const UNASSIGNED_WALL = 'No wall'

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const keyPath = arg('key') ?? process.env.GOOGLE_APPLICATION_CREDENTIALS
if (!keyPath) {
  console.error(
    'No credentials. Pass --key <service-account.json> or set GOOGLE_APPLICATION_CREDENTIALS.',
  )
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

// ─── The same reading the app does ───────────────────────────────────────────
// Mirrors web/src/domain/summaries.ts. Deliberately duplicated rather than
// imported: this is plain Node against a TypeScript app, and the raw fields are
// printed alongside anyway, so a drift here cannot hide the evidence.

function communityGradeIndex(b) {
  const votes = Object.values(b.gradeVotes ?? {}).filter((v) => typeof v === 'number')
  if (typeof b.setterGradeVote === 'number') votes.push(b.setterGradeVote)
  if (votes.length === 0) return null
  const avg = votes.reduce((s, v) => s + v, 0) / votes.length
  return Math.round(Math.min(Math.max(avg, 0), GRADES.length - 1))
}

function canonicalWall(raw) {
  const target = String(raw ?? '').trim().toLowerCase()
  if (!target) return null
  return LOCATIONS.find((l) => l.toLowerCase() === target) ?? null
}

function cellOf(b) {
  const gi = communityGradeIndex(b)
  const walls = [...new Set((b.locations ?? []).map(canonicalWall).filter(Boolean))]
  return {
    row: gi === null ? UNGRADED : GRADES[gi],
    walls: walls.length ? walls : [UNASSIGNED_WALL],
  }
}

// ─── Seasons ─────────────────────────────────────────────────────────────────

const seasonSnap = await db.collection('boulderSeasons').get()
const seasons = seasonSnap.docs.map((d) => ({ id: d.id, name: d.get('name') ?? '' }))

const wanted = arg('season')
if (!wanted) {
  const all = await db.collection('boulders').get()
  const perSeason = new Map()
  for (const d of all.docs) {
    const s = d.get('seasonId') ?? '(none)'
    perSeason.set(s, (perSeason.get(s) ?? 0) + 1)
  }
  console.log(`${all.size} boulder document(s) across ${perSeason.size} season id(s):\n`)
  for (const [id, n] of [...perSeason.entries()].sort((a, b) => b[1] - a[1])) {
    const named = seasons.find((s) => s.id === id)
    console.log(`  ${String(n).padStart(4)}  ${named ? named.name : '(no season document)'}  [${id}]`)
  }
  console.log('\nRe-run with --season <name or id> to see the boulders in one of them.')
  process.exit(0)
}

const season =
  seasons.find((s) => s.id === wanted) ??
  seasons.find((s) => s.name.toLowerCase() === wanted.toLowerCase())
if (!season) {
  console.error(`No season matching "${wanted}". Known: ${seasons.map((s) => s.name).join(', ')}`)
  process.exit(1)
}

// Read every boulder and filter here rather than querying, exactly as
// getBouldersForSeason does — so a document whose seasonId is stored oddly
// shows up as absent here in the same way it does in the app.
const snap = await db.collection('boulders').get()
const rows = snap.docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((b) => b.seasonId === season.id && b.removed !== true)
  .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))

console.log(`\n${season.name} [${season.id}] — ${rows.length} boulder(s), removed ones excluded\n`)

const gradeFilter = arg('grade')
const wallFilter = arg('wall')
const shown = rows.filter((b) => {
  const { row, walls } = cellOf(b)
  if (gradeFilter && row.toLowerCase() !== gradeFilter.toLowerCase()) return false
  if (wallFilter && !walls.some((w) => w.toLowerCase() === wallFilter.toLowerCase())) return false
  return true
})

if (gradeFilter || wallFilter) {
  console.log(
    `filtered to ${shown.length} of ${rows.length}` +
      `${gradeFilter ? ` · grade ${gradeFilter}` : ''}${wallFilter ? ` · wall ${wallFilter}` : ''}\n`,
  )
}

for (const b of shown) {
  const { row, walls } = cellOf(b)
  const votes = Object.values(b.gradeVotes ?? {})
  console.log(`#${String(b.number ?? '?').padEnd(4)} ${b.name || '(unnamed)'}`)
  console.log(`      counts as        ${row}  ×  ${walls.join(', ')}`)
  console.log(`      locations (raw)  ${JSON.stringify(b.locations ?? null)}`)
  console.log(
    `      setterGradeVote  ${JSON.stringify(b.setterGradeVote ?? null)}` +
      `   gradeVotes ${JSON.stringify(b.gradeVotes ?? {})}` +
      (votes.length ? `  (${votes.length} member vote(s))` : ''),
  )
  console.log(`      doc              ${b.id}   internalId ${b.internalId ?? '(none)'}`)
  console.log('')
}

// ─── The table, rebuilt ──────────────────────────────────────────────────────

const gradeRows = [...GRADES, UNGRADED]
const counts = {}
const rowTotals = {}
const colTotals = {}
for (const g of gradeRows) {
  counts[g] = {}
  rowTotals[g] = 0
}
const columns = [...LOCATIONS]
let unassigned = 0
for (const b of rows) {
  const { row, walls } = cellOf(b)
  rowTotals[row]++
  if (walls[0] === UNASSIGNED_WALL) unassigned++
  for (const w of walls) {
    counts[row][w] = (counts[row][w] ?? 0) + 1
    colTotals[w] = (colTotals[w] ?? 0) + 1
  }
}
if (unassigned > 0) columns.push(UNASSIGNED_WALL)

const w = (s) => String(s).padStart(11)
console.log('Boulders by grade and wall — the same table the app draws:\n')
console.log(`${'grade'.padEnd(10)}${columns.map(w).join('')}${w('TOTAL')}`)
for (const g of gradeRows) {
  console.log(
    `${g.padEnd(10)}${columns.map((c) => w(counts[g][c] ?? 0)).join('')}${w(rowTotals[g])}`,
  )
}
console.log(
  `${'TOTAL'.padEnd(10)}${columns.map((c) => w(colTotals[c] ?? 0)).join('')}${w(rows.length)}`,
)

if (unassigned > 0) {
  console.log(
    `\n  ${unassigned} boulder(s) have no wall this app recognises. Open each in the app` +
      `\n  and pick its wall — the add form does not currently insist on one.`,
  )
}
const unknown = [
  ...new Set(rows.flatMap((b) => (b.locations ?? []).filter((l) => !canonicalWall(l)))),
]
if (unknown.length) {
  console.log(`\n  wall names stored that this app does not know: ${JSON.stringify(unknown)}`)
}
process.exit(0)
