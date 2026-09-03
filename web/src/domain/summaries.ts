import type { Boulder } from '@/services/boulders'
import type { ClimbLocation, GradeSystem, PersonalClimb } from '@/services/climblog'

// The numbers behind the two summary screens, kept out of the components so
// each bucket can be checked without rendering a chart. Ported from
// mobile@1cdfada/app/boulder-summary.tsx and .../climb-summary.tsx, which did
// all of this inline.
//
// Grade scales and wall names arrive as parameters rather than being imported
// from services/, per the pure-logic-first pattern in web/CLAUDE.md: a runtime
// import would pull Firestore in behind it, which is both a lie about what this
// module needs and enough to stop it being testable in a plain Node process.

// ─── Boulder summary ─────────────────────────────────────────────────────────

export const UNGRADED = 'Ungraded'
/** A grade name, or the bucket for boulders nobody has voted on. */
export type GradeRow = string

/** The scale plus the Ungraded bucket, which is always the last row. */
export function gradeRows(grades: readonly string[]): GradeRow[] {
  return [...grades, UNGRADED]
}

/**
 * The grade a boulder counts as: community votes plus the setter's own, rounded
 * to the nearest grade, or `null` when nobody has voted.
 *
 * The setter's vote lives on the boulder rather than in the votes map, so it has
 * to be folded in under a key that cannot collide with a uid.
 */
export function communityGradeIndex(b: Boulder, gradeCount: number): number | null {
  const votes = Object.values(b.gradeVotes ?? {})
  if (b.setterGradeVote !== null && b.setterGradeVote !== undefined) votes.push(b.setterGradeVote)
  if (votes.length === 0) return null
  const avg = votes.reduce((s, v) => s + v, 0) / votes.length
  return Math.round(Math.min(Math.max(avg, 0), gradeCount - 1))
}

/**
 * The column for boulders on no wall this app knows about.
 *
 * It exists because the alternative was silence. A boulder whose `locations` is
 * empty — the add form asks for a wall and does not insist on one — or whose
 * wall is spelled some way `LOCATIONS` does not list was dropped from every
 * column while still counting in its grade row and in the Boulders tile. The
 * table then showed a grade with boulders in it and not one cell to put them
 * in, which reads as "the count is broken" rather than "nobody said where this
 * one is", and there was nothing on the screen to tell the two apart.
 */
export const UNASSIGNED_WALL = 'No wall'

/**
 * The wall a stored value names, or null if it names none of them.
 *
 * Compared case- and padding-insensitively. The two clients both write the
 * exact strings in `LOCATIONS`, so this is not for them — it is for everything
 * else that has ever touched the collection: a document edited by hand in the
 * Firebase console, an old import, a wall renamed with rows left behind. Those
 * are the rows that used to vanish, and folding the comparison is cheaper than
 * losing them.
 */
export function canonicalWall(locations: readonly string[], raw: string): string | null {
  const target = raw.trim().toLowerCase()
  if (!target) return null
  return locations.find((l) => l.trim().toLowerCase() === target) ?? null
}

/**
 * Where one boulder lands in the table: its grade row, and the wall columns it
 * counts in.
 *
 * Pulled out of `gradeLocationMatrix` so the screen can ask the same question
 * of a single boulder and get the same answer by construction. A table that
 * says "4" and cannot tell you which four is a table you have to take on
 * trust — which is exactly how a miscount goes unnoticed, and how a *correct*
 * count gets mistaken for one.
 */
export function boulderCell(
  b: Boulder,
  grades: readonly string[],
  locations: readonly string[],
): { row: GradeRow; walls: string[] } {
  const gi = communityGradeIndex(b, grades.length)
  const walls = new Set<string>()
  for (const raw of b.locations) {
    const wall = canonicalWall(locations, raw)
    if (wall) walls.add(wall)
  }
  return {
    row: gi === null ? UNGRADED : grades[gi],
    walls: walls.size > 0 ? [...walls] : [UNASSIGNED_WALL],
  }
}

export type GradeLocationMatrix = {
  /** counts[grade][location] */
  counts: Record<GradeRow, Record<string, number>>
  rowTotals: Record<GradeRow, number>
  colTotals: Record<string, number>
  /** Boulders counted — not the sum of the cells, see below. */
  total: number
  /** Largest single cell, so a fill ramp has something to scale against. */
  busiestCell: number
  /**
   * The columns to draw, in order: the walls, plus `UNASSIGNED_WALL` at the end
   * when something needs it. Only ever grows by that one, so a clean season
   * looks exactly as it did.
   */
  columns: string[]
  /** Boulders on no recognised wall — the size of the extra column. */
  unassigned: number
  /** The stored wall names that matched nothing, for the screen to name them. */
  unrecognisedWalls: string[]
}

/**
 * Boulders counted by grade against wall.
 *
 * A boulder set across two walls is counted once per wall, so the cells add up
 * to more than the boulder count. `total` is the honest number of boulders and
 * the row totals match it; only the columns double-count. The screen says so.
 *
 * Every boulder lands in exactly one row and at least one column — see
 * `UNASSIGNED_WALL`. Walls are de-duplicated per boulder as well, so a record
 * listing the same wall twice is one boulder on that wall and not two.
 */
export function gradeLocationMatrix(
  boulders: Boulder[],
  grades: readonly string[],
  locations: readonly string[],
): GradeLocationMatrix {
  const rows = gradeRows(grades)
  const counts = {} as Record<GradeRow, Record<string, number>>
  const rowTotals = {} as Record<GradeRow, number>
  const colTotals: Record<string, number> = {}
  const unrecognised = new Set<string>()
  let unassigned = 0

  for (const g of rows) {
    counts[g] = {}
    rowTotals[g] = 0
  }
  for (const loc of locations) colTotals[loc] = 0
  colTotals[UNASSIGNED_WALL] = 0

  for (const b of boulders) {
    const { row, walls } = boulderCell(b, grades, locations)
    rowTotals[row]++

    for (const raw of b.locations) {
      if (!canonicalWall(locations, raw) && raw.trim()) unrecognised.add(raw.trim())
    }
    if (walls[0] === UNASSIGNED_WALL) unassigned++

    for (const wall of walls) {
      counts[row][wall] = (counts[row][wall] ?? 0) + 1
      colTotals[wall]++
    }
  }

  const columns = unassigned > 0 ? [...locations, UNASSIGNED_WALL] : [...locations]
  const busiestCell = Math.max(
    0,
    ...rows.flatMap((g) => columns.map((col) => counts[g][col] ?? 0)),
  )
  return {
    counts,
    rowTotals,
    colTotals,
    total: boulders.length,
    busiestCell,
    columns,
    unassigned,
    unrecognisedWalls: [...unrecognised].sort(),
  }
}

export type QualityBuckets = {
  threeStar: number
  twoStar: number
  oneStar: number
  unrated: number
}

/**
 * Boulders bucketed by their average quality vote.
 *
 * Reads `qualityVotes` off the boulder rather than recomputing from climb logs:
 * that is where a vote is stored, and it avoids a summary disagreeing with the
 * stars shown on the boulder itself.
 */
export function qualityBuckets(boulders: Boulder[]): QualityBuckets {
  const out: QualityBuckets = { threeStar: 0, twoStar: 0, oneStar: 0, unrated: 0 }
  for (const b of boulders) {
    const votes = Object.values(b.qualityVotes ?? {}).filter((v) => v > 0)
    if (votes.length === 0) {
      out.unrated++
      continue
    }
    const avg = votes.reduce((s, v) => s + v, 0) / votes.length
    if (avg >= 2.5) out.threeStar++
    else if (avg >= 1.5) out.twoStar++
    else out.oneStar++
  }
  return out
}

export type SetterTally = { name: string; count: number; percent: number }

/**
 * Who set how much, biggest first.
 *
 * Capped at `limit` named setters with the tail gathered into "Other". mobile
 * drew every setter in its own colour off a 15-entry cycling list; past a
 * handful those hues stop being tellable apart, and the chart this feeds draws
 * one hue for every bar anyway — the ranking is the message, not the identity.
 */
export function setterTallies(boulders: Boulder[], limit = 8): SetterTally[] {
  const counts = new Map<string, number>()
  for (const b of boulders) {
    const name = b.setter.trim() || 'Unknown'
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const total = boulders.length
  if (total === 0) return []

  const sorted = [...counts.entries()].sort(([an, a], [bn, b]) => b - a || an.localeCompare(bn))
  const head = sorted.slice(0, limit)
  const tail = sorted.slice(limit)
  const rows = head.map(([name, count]) => ({ name, count }))
  if (tail.length > 0) {
    rows.push({ name: `Other (${tail.length})`, count: tail.reduce((s, [, c]) => s + c, 0) })
  }
  return rows.map((r) => ({ ...r, percent: Math.round((r.count / total) * 100) }))
}

// ─── Climb summary ───────────────────────────────────────────────────────────

export type GradeBar = { grade: string; sends: number; attempts: number }

/**
 * Climbs per grade on one grade scale, split by whether they went.
 *
 * Grades with nothing on them are dropped — an axis of empty V0–V17 says less
 * than the four grades you actually climbed. KBC logs carry the established
 * grade (the wall's own), everything else the climber's own call.
 */
export function gradeBars(
  climbs: PersonalClimb[],
  system: GradeSystem,
  scale: readonly string[],
): GradeBar[] {
  const sends = new Map<string, number>()
  const attempts = new Map<string, number>()

  for (const c of climbs) {
    const grade = system === 'kbc' ? c.establishedGrade : c.personalGrade
    if (!grade || !scale.includes(grade)) continue
    const bucket = c.type === 'ascent' ? sends : attempts
    bucket.set(grade, (bucket.get(grade) ?? 0) + 1)
  }

  return scale
    .map((grade) => ({ grade, sends: sends.get(grade) ?? 0, attempts: attempts.get(grade) ?? 0 }))
    .filter((b) => b.sends + b.attempts > 0)
}

export type ClimbStats = {
  sends: number
  attempts: number
  projects: number
  /** Distinct days with any climb logged — a session, near enough. */
  sessions: number
  /** null rather than 0 when there is nothing to divide by. */
  perSession: number | null
  perMonth: number | null
}

/** The day a climb happened, preferring when it happened over when it was typed in. */
function dayKey(c: PersonalClimb): string {
  return (c.timestamp || c.createdAt || '').slice(0, 10)
}

export function climbStats(climbs: PersonalClimb[]): ClimbStats {
  const sessions = new Set(climbs.map(dayKey).filter(Boolean))
  const months = new Set([...sessions].map((d) => d.slice(0, 7)))
  return {
    sends: climbs.filter((c) => c.type === 'ascent').length,
    attempts: climbs.filter((c) => c.type === 'attempt').length,
    projects: climbs.filter((c) => c.project).length,
    sessions: sessions.size,
    perSession: sessions.size > 0 ? climbs.length / sessions.size : null,
    perMonth: months.size > 0 ? climbs.length / months.size : null,
  }
}

export type ClimbSection = { system: GradeSystem; title: string; bars: GradeBar[] }

const SYSTEM_TITLES: Record<GradeSystem, string> = {
  kbc: 'KBC grades',
  'v-scale': 'V-scale',
  font: 'Font scale',
  yosemite: 'Yosemite (YDS)',
}

/** Which grade system a climb was logged against, via its location's sector. */
function systemOf(climb: PersonalClimb, locations: ClimbLocation[]): GradeSystem {
  if (climb.locationId === 'kbc') return 'kbc'
  const sector = locations
    .find((l) => l.id === climb.locationId)
    ?.sectors.find((s) => s.name === climb.sectorId)
  return sector?.gradeSystem ?? 'v-scale'
}

/**
 * One chart per grade scale in play, empty ones omitted.
 *
 * Grades from different scales cannot share an axis — V4 and Font 6C are not
 * the same column — so mixing locations means several charts rather than one
 * with a blended axis.
 */
export function climbSections(
  climbs: PersonalClimb[],
  locations: ClimbLocation[],
  scaleFor: (system: GradeSystem) => readonly string[],
): ClimbSection[] {
  const bySystem = new Map<GradeSystem, PersonalClimb[]>()
  for (const c of climbs) {
    const system = systemOf(c, locations)
    const list = bySystem.get(system)
    if (list) list.push(c)
    else bySystem.set(system, [c])
  }

  const order: GradeSystem[] = ['kbc', 'v-scale', 'font', 'yosemite']
  return order
    .map((system) => ({
      system,
      title: SYSTEM_TITLES[system],
      bars: gradeBars(bySystem.get(system) ?? [], system, scaleFor(system)),
    }))
    .filter((s) => s.bars.length > 0)
}
