import { describe, expect, it } from 'vitest'
import {
  GRADE_BAND_COUNT,
  averageGradeIndex,
  fractionForGrade,
  gradeFromFraction,
  gradeIndexFromVote,
} from './gradeVote'

// Not imported from services/boulders.ts on purpose: that module reaches
// `lib/firebase`, which initialises Auth on import and cannot run here. The
// scale is checked against `GRADES` where it can be — a DEV assertion in
// services/boulders.ts itself.
const [WHITE, BLUE, PURPLE, PINK, BLACK] = [0, 1, 2, 3, 4]

describe('GRADE_BAND_COUNT', () => {
  it('is the five-band KBC scale', () => {
    expect(GRADE_BAND_COUNT).toBe(5)
  })
})

describe('gradeFromFraction', () => {
  it('gives the band the press landed in', () => {
    expect(gradeFromFraction(0.0)).toBe(WHITE)
    expect(gradeFromFraction(0.1)).toBe(WHITE)
    expect(gradeFromFraction(0.25)).toBe(BLUE)
    expect(gradeFromFraction(0.5)).toBe(PURPLE)
    expect(gradeFromFraction(0.7)).toBe(PINK)
    expect(gradeFromFraction(0.9)).toBe(BLACK)
  })

  it('counts a press anywhere in Black as Black', () => {
    for (const frac of [0.8, 0.85, 0.9, 0.99, 1]) {
      expect(gradeFromFraction(frac)).toBe(BLACK)
    }
  })

  it('clamps a press that ran off either end', () => {
    expect(gradeFromFraction(-3)).toBe(WHITE)
    expect(gradeFromFraction(9)).toBe(BLACK)
  })
})

describe('fractionForGrade', () => {
  it('puts the mark in the middle of its band', () => {
    expect(fractionForGrade(WHITE)).toBeCloseTo(0.1)
    expect(fractionForGrade(PINK)).toBeCloseTo(0.7)
    expect(fractionForGrade(BLACK)).toBeCloseTo(0.9)
  })

  it('round-trips with gradeFromFraction for every grade', () => {
    for (let i = 0; i < GRADE_BAND_COUNT; i++) {
      expect(gradeFromFraction(fractionForGrade(i))).toBe(i)
    }
  })
})

describe('gradeIndexFromVote', () => {
  // The property that makes this safe to apply to every vote ever stored.
  it('leaves a vote that was already an index exactly where it is', () => {
    for (let i = 0; i < GRADE_BAND_COUNT; i++) {
      expect(gradeIndexFromVote(i)).toBe(i)
    }
  })

  it('reads a legacy position as the band it was pressed in', () => {
    // The old bar wrote (x / width) * 4, so 3.2 was a press at 80% — the very
    // start of Black — and 3.6 was the middle of it. Both were Black presses
    // that every count rounded down to Pink.
    expect(gradeIndexFromVote(3.2)).toBe(BLACK)
    expect(gradeIndexFromVote(3.4)).toBe(BLACK)
    expect(gradeIndexFromVote(3.6)).toBe(BLACK)
    expect(gradeIndexFromVote(3.9)).toBe(BLACK)
  })

  it('does not drag a genuine Pink press into Black', () => {
    // 2.8 was the middle of Pink; 3.0 was 75% along, still inside Pink.
    expect(gradeIndexFromVote(2.8)).toBe(PINK)
    expect(gradeIndexFromVote(3.0)).toBe(PINK)
  })

  it('reads every legacy band centre as that band', () => {
    // What the middle of each band recorded under the old mapping.
    expect(gradeIndexFromVote(0.4)).toBe(WHITE)
    expect(gradeIndexFromVote(1.2)).toBe(BLUE)
    expect(gradeIndexFromVote(2.0)).toBe(PURPLE)
    expect(gradeIndexFromVote(2.8)).toBe(PINK)
    expect(gradeIndexFromVote(3.6)).toBe(BLACK)
  })

  it('survives a value that is not a number', () => {
    expect(gradeIndexFromVote(NaN)).toBe(WHITE)
    expect(gradeIndexFromVote(Infinity)).toBe(WHITE)
    expect(gradeIndexFromVote(-2)).toBe(WHITE)
    expect(gradeIndexFromVote(99)).toBe(BLACK)
  })
})

describe('averageGradeIndex', () => {
  it('is null when nobody has voted', () => {
    expect(averageGradeIndex([])).toBeNull()
  })

  // The reported bug, exactly: a setter and a member both pressed Black, the
  // bar drew the marker in Black, and the summary counted the boulder as Pink.
  it('counts a boulder two people marked Black as Black', () => {
    expect(averageGradeIndex([3.4, 3.52])).toBe(BLACK)
  })

  it('still calls two Pinks and a Black a Pink', () => {
    expect(averageGradeIndex([PINK, PINK, BLACK])).toBe(PINK)
  })

  it('rounds a genuine split upward, as it always did', () => {
    expect(averageGradeIndex([PINK, BLACK])).toBe(BLACK)
  })

  it('snaps each vote before averaging, not after', () => {
    // Raw, these average to 3.46 and round to Pink. Read as the presses they
    // were — Black and Black — they are Black.
    expect(averageGradeIndex([3.4, 3.52])).not.toBe(PINK)
  })

  it('agrees with a plain average when every vote is already an index', () => {
    expect(averageGradeIndex([WHITE, BLUE])).toBe(1) // 0.5 → rounds to Blue
    expect(averageGradeIndex([PURPLE, PURPLE, PURPLE])).toBe(PURPLE)
    expect(averageGradeIndex([WHITE, BLACK])).toBe(PURPLE)
  })
})
