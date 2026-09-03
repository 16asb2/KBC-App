import { describe, expect, it } from 'vitest'
import {
  climbSections,
  climbStats,
  communityGradeIndex,
  gradeBars,
  gradeLocationMatrix,
  qualityBuckets,
  setterTallies,
  UNASSIGNED_WALL,
  UNGRADED,
} from './summaries'
import type { Boulder } from '@/services/boulders'
import type { ClimbLocation, GradeSystem, PersonalClimb } from '@/services/climblog'

// The scales the app uses, spelled out here rather than imported: a runtime
// import from services/ would drag Firestore into a pure-logic test.
const GRADES = ['White', 'Blue', 'Purple', 'Pink', 'Black'] as const
const LOCATIONS = [
  'Cave Right',
  'Cave Middle',
  'Cave Left',
  'Green Wall',
  'Blue Wall',
  'Yellow Wall',
] as const
const V_SCALE = ['V0', 'V1', 'V2', 'V3', 'V4', 'V5'] as const
const FONT = ['6A', '6B', '6C', '7A'] as const
const scaleFor = (gs: GradeSystem) => (gs === 'kbc' ? GRADES : gs === 'font' ? FONT : V_SCALE)

/** The matrix always takes the same two scales here. */
const MATRIX = (bs: Boulder[]) => gradeLocationMatrix(bs, GRADES, LOCATIONS)

function boulder(over: Partial<Boulder> = {}): Boulder {
  return {
    id: 'b1',
    internalId: 'i1',
    local: 'KBC',
    area: 'Boulders',
    permissions: { view: 'members', edit: 'admin' },
    seasonId: 's1',
    number: 1,
    name: '',
    tapeColor: 'red',
    setter: 'Artur',
    setterEmail: '',
    createdByUid: 'u1',
    createdAt: '',
    updatedAt: '',
    locations: ['Cave Right'],
    photo: '',
    removed: false,
    likes: [],
    setterGradeVote: null,
    setterBadges: [],
    gradeVotes: {},
    qualityVotes: {},
    ...over,
  }
}

function climb(over: Partial<PersonalClimb> = {}): PersonalClimb {
  return {
    id: 'c1',
    uid: 'u1',
    locationId: 'kbc',
    boulderId: '',
    sectorId: '',
    timestamp: '2026-06-15T18:00:00.000Z',
    name: '',
    establishedGrade: 'Blue',
    personalGrade: '',
    gradeVote: null,
    problemInternalId: '',
    quality: 0,
    effort: '',
    type: 'ascent',
    project: false,
    attempts: 0,
    badges: [],
    comment: '',
    createdAt: '2026-06-15T18:00:00.000Z',
    ...over,
  }
}

describe('communityGradeIndex', () => {
  it('is null when nobody has voted', () => {
    expect(communityGradeIndex(boulder(), GRADES.length)).toBeNull()
  })

  it('averages the community votes', () => {
    expect(communityGradeIndex(boulder({ gradeVotes: { a: 1, b: 3 } }), GRADES.length)).toBe(2)
  })

  it("counts the setter's own vote, which is stored off the votes map", () => {
    expect(communityGradeIndex(boulder({ setterGradeVote: 4 }), GRADES.length)).toBe(4)
    // 4 and 0 average to 2 — the setter's vote is one voice, not an override.
    expect(
      communityGradeIndex(boulder({ setterGradeVote: 4, gradeVotes: { a: 0 } }), GRADES.length),
    ).toBe(2)
  })

  it('clamps a stray out-of-range average into the scale', () => {
    expect(communityGradeIndex(boulder({ gradeVotes: { a: 9 } }), GRADES.length)).toBe(4)
    expect(communityGradeIndex(boulder({ gradeVotes: { a: -3 } }), GRADES.length)).toBe(0)
  })
})

describe('gradeLocationMatrix', () => {
  it('counts a boulder in its grade row and every wall it is on', () => {
    const m = MATRIX([boulder({ gradeVotes: { a: 1 }, locations: ['Cave Right', 'Cave Middle'] })])
    expect(m.counts.Blue['Cave Right']).toBe(1)
    expect(m.counts.Blue['Cave Middle']).toBe(1)
    expect(m.rowTotals.Blue).toBe(1)
  })

  it('keeps the boulder count honest even though the columns double-count', () => {
    const m = MATRIX([boulder({ gradeVotes: { a: 1 }, locations: ['Cave Right', 'Cave Middle'] })])
    // One boulder, two wall cells.
    expect(m.total).toBe(1)
    expect(m.colTotals['Cave Right'] + m.colTotals['Cave Middle']).toBe(2)
  })

  it('files an unvoted boulder under Ungraded', () => {
    const m = MATRIX([boulder()])
    expect(m.rowTotals[UNGRADED]).toBe(1)
  })

  // These four are one bug: a boulder could be counted in its grade row and in
  // the Boulders tile while appearing in no column at all, which read on screen
  // as a count that had simply stopped working.
  it('gives a boulder with no wall on record a column of its own', () => {
    const m = MATRIX([boulder({ gradeVotes: { a: 4 }, locations: [] })])
    expect(m.counts.Black[UNASSIGNED_WALL]).toBe(1)
    expect(m.colTotals[UNASSIGNED_WALL]).toBe(1)
    expect(m.columns).toContain(UNASSIGNED_WALL)
    expect(m.unassigned).toBe(1)
  })

  it('names a wall it does not recognise instead of dropping the boulder', () => {
    const m = MATRIX([boulder({ locations: ['Demolished Wall'] })])
    expect(m.total).toBe(1)
    expect(m.counts[UNGRADED][UNASSIGNED_WALL]).toBe(1)
    expect(m.unrecognisedWalls).toEqual(['Demolished Wall'])
  })

  it('matches a wall whatever case or padding it was stored with', () => {
    const m = MATRIX([boulder({ gradeVotes: { a: 4 }, locations: [' yellow wall '] })])
    expect(m.counts.Black['Yellow Wall']).toBe(1)
    expect(m.unassigned).toBe(0)
    expect(m.unrecognisedWalls).toEqual([])
  })

  it('leaves a clean season looking exactly as it did', () => {
    const m = MATRIX([boulder({ gradeVotes: { a: 1 }, locations: ['Cave Right'] })])
    expect(m.columns).toEqual([...LOCATIONS])
    expect(m.unassigned).toBe(0)
  })

  it('counts a wall listed twice on one boulder once', () => {
    const m = MATRIX([boulder({ gradeVotes: { a: 4 }, locations: ['Yellow Wall', 'Yellow Wall'] })])
    expect(m.counts.Black['Yellow Wall']).toBe(1)
    expect(m.colTotals['Yellow Wall']).toBe(1)
  })

  it('counts every boulder in some column', () => {
    const bs = [
      boulder({ gradeVotes: { a: 4 }, locations: ['Yellow Wall'] }),
      boulder({ gradeVotes: { a: 4 }, locations: [] }),
      boulder({ locations: ['Nowhere'] }),
    ]
    const m = MATRIX(bs)
    const inColumns = m.columns.reduce((s, c) => s + m.colTotals[c], 0)
    // Equal because none of these three is on two walls; the invariant that
    // holds in general is that nothing is left out.
    expect(inColumns).toBe(m.total)
  })

  it('reports the busiest cell for a fill scale to work against', () => {
    const m = MATRIX([
      boulder({ gradeVotes: { a: 1 } }),
      boulder({ gradeVotes: { a: 1 } }),
      boulder({ gradeVotes: { a: 4 } }),
    ])
    expect(m.busiestCell).toBe(2)
  })

  it('survives an empty season', () => {
    const m = MATRIX([])
    expect(m.total).toBe(0)
    expect(m.busiestCell).toBe(0)
  })
})

describe('qualityBuckets', () => {
  it('buckets by average vote and counts unvoted boulders as unrated', () => {
    const b = qualityBuckets([
      boulder({ qualityVotes: { a: 3, b: 3 } }),
      boulder({ qualityVotes: { a: 2 } }),
      boulder({ qualityVotes: { a: 1 } }),
      boulder(),
    ])
    expect(b).toEqual({ threeStar: 1, twoStar: 1, oneStar: 1, unrated: 1 })
  })

  it('ignores zero votes, which mean "no opinion" rather than nought stars', () => {
    expect(qualityBuckets([boulder({ qualityVotes: { a: 0 } })]).unrated).toBe(1)
  })
})

describe('setterTallies', () => {
  it('ranks setters and works out each share', () => {
    const rows = setterTallies([
      boulder({ setter: 'Artur' }),
      boulder({ setter: 'Artur' }),
      boulder({ setter: 'Bea' }),
    ])
    expect(rows).toEqual([
      { name: 'Artur', count: 2, percent: 67 },
      { name: 'Bea', count: 1, percent: 33 },
    ])
  })

  it('labels a missing setter rather than dropping the boulder', () => {
    expect(setterTallies([boulder({ setter: '  ' })])[0].name).toBe('Unknown')
  })

  it('gathers the tail past the limit into one Other row', () => {
    const rows = setterTallies(
      ['a', 'b', 'c', 'd'].map((s) => boulder({ setter: s })),
      2,
    )
    expect(rows.map((r) => r.name)).toEqual(['a', 'b', 'Other (2)'])
    expect(rows[2].count).toBe(2)
  })

  it('is empty for an empty season rather than dividing by zero', () => {
    expect(setterTallies([])).toEqual([])
  })
})

describe('gradeBars', () => {
  it('splits sends from attempts per grade', () => {
    const bars = gradeBars(
      [
        climb({ establishedGrade: 'Blue', type: 'ascent' }),
        climb({ establishedGrade: 'Blue', type: 'attempt' }),
        climb({ establishedGrade: 'Pink', type: 'ascent' }),
      ],
      'kbc',
      GRADES,
    )
    expect(bars).toEqual([
      { grade: 'Blue', sends: 1, attempts: 1 },
      { grade: 'Pink', sends: 1, attempts: 0 },
    ])
  })

  it('drops grades nobody climbed instead of drawing an empty axis', () => {
    const bars = gradeBars([climb({ establishedGrade: 'Blue' })], 'kbc', GRADES)
    expect(bars).toHaveLength(1)
  })

  it('keeps the scale order rather than the order climbs were logged', () => {
    const bars = gradeBars(
      [climb({ establishedGrade: 'Black' }), climb({ establishedGrade: 'White' })],
      'kbc',
      GRADES,
    )
    expect(bars.map((b) => b.grade)).toEqual(['White', 'Black'])
  })

  it('reads the personal grade outside KBC, where there is no established one', () => {
    const bars = gradeBars(
      [climb({ locationId: 'loc1', establishedGrade: '', personalGrade: 'V4' })],
      'v-scale',
      V_SCALE,
    )
    expect(bars).toEqual([{ grade: 'V4', sends: 1, attempts: 0 }])
  })

  it('ignores a grade that is not on the scale being charted', () => {
    expect(gradeBars([climb({ establishedGrade: 'V4' })], 'kbc', GRADES)).toEqual([])
  })
})

describe('climbStats', () => {
  it('counts sends, attempts and projects', () => {
    const s = climbStats([
      climb({ type: 'ascent' }),
      climb({ type: 'attempt' }),
      climb({ type: 'attempt', project: true }),
    ])
    expect([s.sends, s.attempts, s.projects]).toEqual([1, 2, 1])
  })

  it('counts a session as a distinct day, not a distinct climb', () => {
    const s = climbStats([
      climb({ timestamp: '2026-06-15T18:00:00.000Z' }),
      climb({ timestamp: '2026-06-15T20:00:00.000Z' }),
      climb({ timestamp: '2026-06-17T18:00:00.000Z' }),
    ])
    expect(s.sessions).toBe(2)
    expect(s.perSession).toBeCloseTo(1.5)
  })

  it('falls back to createdAt when the climb has no timestamp', () => {
    expect(
      climbStats([climb({ timestamp: '', createdAt: '2026-06-15T18:00:00.000Z' })]).sessions,
    ).toBe(1)
  })

  it('averages per month across the months actually climbed', () => {
    const s = climbStats([
      climb({ timestamp: '2026-06-15T18:00:00.000Z' }),
      climb({ timestamp: '2026-07-15T18:00:00.000Z' }),
    ])
    expect(s.perMonth).toBeCloseTo(1)
  })

  it('reports null rather than zero when there is nothing to average', () => {
    const s = climbStats([])
    expect(s.perSession).toBeNull()
    expect(s.perMonth).toBeNull()
  })
})

describe('climbSections', () => {
  const locations: ClimbLocation[] = [
    {
      id: 'loc1',
      uid: 'u1',
      name: 'Niagara Glen',
      type: 'outdoor',
      sectors: [{ name: 'Main', gradeSystem: 'font', discipline: 'boulder' }],
    } as ClimbLocation,
  ]

  it('gives each grade scale its own chart', () => {
    const sections = climbSections(
      [
        climb({ locationId: 'kbc', establishedGrade: 'Blue' }),
        climb({ locationId: 'loc1', sectorId: 'Main', personalGrade: '6C' }),
      ],
      locations,
      scaleFor,
    )
    expect(sections.map((s) => s.system)).toEqual(['kbc', 'font'])
  })

  it('omits a scale with nothing on it', () => {
    const sections = climbSections(
      [climb({ locationId: 'kbc', establishedGrade: 'Blue' })],
      locations,
      scaleFor,
    )
    expect(sections).toHaveLength(1)
  })

  it('falls back to the V-scale for a climb whose sector is unknown', () => {
    const sections = climbSections(
      [climb({ locationId: 'gone', sectorId: 'Nowhere', personalGrade: 'V2' })],
      locations,
      scaleFor,
    )
    expect(sections.map((s) => s.system)).toEqual(['v-scale'])
  })
})
