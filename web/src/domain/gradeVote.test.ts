import { describe, expect, it } from 'vitest'
import {
  GRADE_BAND_COUNT,
  MAX_VOTE,
  averageGradeIndex,
  averageVotePosition,
  fractionForVote,
  gradeIndexFromPosition,
  voteFromFraction,
} from './gradeVote'

// Not imported from services/boulders.ts on purpose: that module reaches
// `lib/firebase`, which initialises Auth on import and cannot run here. The
// scale is checked against `GRADES` where it can be — a DEV assertion in
// services/boulders.ts itself.
const [WHITE, BLUE, PURPLE, PINK, BLACK] = [0, 1, 2, 3, 4]

/** Where each colour band starts and ends on the 0–4 vote scale. */
const BLACK_STARTS_AT = 3.2 // 80% of the bar
const PINK_STARTS_AT = 2.4 // 60%

describe('the scale', () => {
  it('is five bands running 0 to 4', () => {
    expect(GRADE_BAND_COUNT).toBe(5)
    expect(MAX_VOTE).toBe(4)
  })
})

describe('voteFromFraction', () => {
  it('is analog — a press keeps where it landed', () => {
    expect(voteFromFraction(0.5)).toBe(2)
    expect(voteFromFraction(0.85)).toBeCloseTo(3.4)
    expect(voteFromFraction(0.82)).toBeCloseTo(3.28)
  })

  it('does not snap to whole grades', () => {
    // The behaviour this replaces: 0.85 used to come back as a flat 4.
    expect(voteFromFraction(0.85)).not.toBe(BLACK)
  })

  it('clamps a press that ran off either end', () => {
    expect(voteFromFraction(-3)).toBe(0)
    expect(voteFromFraction(9)).toBe(MAX_VOTE)
  })
})

describe('fractionForVote', () => {
  it('puts a vote back exactly where it was pressed', () => {
    for (const frac of [0, 0.17, 0.5, 0.82, 1]) {
      expect(fractionForVote(voteFromFraction(frac))).toBeCloseTo(frac)
    }
  })
})

describe('gradeIndexFromPosition', () => {
  it('gives the band the position sits in', () => {
    expect(gradeIndexFromPosition(0)).toBe(WHITE)
    expect(gradeIndexFromPosition(1)).toBe(BLUE)
    expect(gradeIndexFromPosition(2)).toBe(PURPLE)
    expect(gradeIndexFromPosition(3)).toBe(PINK)
    expect(gradeIndexFromPosition(4)).toBe(BLACK)
  })

  it('counts anywhere in the black band as Black, including the very bottom', () => {
    for (const v of [BLACK_STARTS_AT, 3.25, 3.3, 3.5, 3.9, 4]) {
      expect(gradeIndexFromPosition(v)).toBe(BLACK)
    }
  })

  it('does not reach into Black from just under it', () => {
    expect(gradeIndexFromPosition(3.19)).toBe(PINK)
    expect(gradeIndexFromPosition(3.0)).toBe(PINK)
    expect(gradeIndexFromPosition(PINK_STARTS_AT)).toBe(PINK)
    expect(gradeIndexFromPosition(2.39)).toBe(PURPLE)
  })

  it('survives a value that is not a number', () => {
    expect(gradeIndexFromPosition(NaN)).toBe(WHITE)
    expect(gradeIndexFromPosition(-5)).toBe(WHITE)
    expect(gradeIndexFromPosition(99)).toBe(BLACK)
  })
})

describe('averageVotePosition', () => {
  it('is the plain mean, kept analog for the marker', () => {
    expect(averageVotePosition([3.25, 3.3])).toBeCloseTo(3.275)
  })

  it('is null when nobody has voted', () => {
    expect(averageVotePosition([])).toBeNull()
  })
})

describe('averageGradeIndex', () => {
  it('is null when nobody has voted', () => {
    expect(averageGradeIndex([])).toBeNull()
  })

  // The reported bug: several people voting low in Black averaged to a
  // position still inside Black, and rounding to the nearest whole index
  // called it Pink.
  it('counts votes low in the black band as Black', () => {
    expect(averageGradeIndex([3.25, 3.3])).toBe(BLACK)
    expect(averageGradeIndex([3.21, 3.22, 3.24])).toBe(BLACK)
    expect(averageGradeIndex([3.4, 3.52])).toBe(BLACK)
  })

  it('truncates rather than rounds', () => {
    // 3.275 rounds to 3 (Pink) and truncates into Black, which is the band the
    // marker is drawn in. The marker and the count now agree.
    expect(averageGradeIndex([3.25, 3.3])).not.toBe(PINK)
  })

  it('still calls a genuinely Pink average Pink', () => {
    expect(averageGradeIndex([2.8, 3.0])).toBe(PINK)
    expect(averageGradeIndex([3.0, 3.1])).toBe(PINK)
  })

  it('averages first and truncates second, keeping the shading', () => {
    // One Black vote and two low Purples: the mean is 2.6, inside Pink. Had
    // each vote been truncated first the answer would be Purple — a different
    // question, and one the analog bar exists not to ask.
    expect(averageGradeIndex([2.0, 2.0, 3.8])).toBe(PINK)
  })

  it('reads a whole-number vote as the band it names', () => {
    // admin-web/ writes the band index rather than a position. Each one still
    // lands inside its own band on this scale.
    expect(averageGradeIndex([WHITE])).toBe(WHITE)
    expect(averageGradeIndex([BLUE])).toBe(BLUE)
    expect(averageGradeIndex([PURPLE])).toBe(PURPLE)
    expect(averageGradeIndex([PINK])).toBe(PINK)
    expect(averageGradeIndex([BLACK])).toBe(BLACK)
  })

  it('agrees with the band the marker is drawn in, for any set of votes', () => {
    const sets = [[0.1], [1.9, 2.1], [3.25, 3.3], [2.0, 2.0, 3.8], [4, 3.6], [0, 4]]
    for (const votes of sets) {
      const mean = averageVotePosition(votes)!
      const drawnAt = fractionForVote(mean)
      const bandUnderMarker = Math.min(
        GRADE_BAND_COUNT - 1,
        Math.floor(drawnAt * GRADE_BAND_COUNT),
      )
      expect(averageGradeIndex(votes)).toBe(bandUnderMarker)
    }
  })
})
