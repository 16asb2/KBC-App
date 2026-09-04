// What a grade vote is, and what a set of them adds up to.
//
// The bar is **analog**. A vote is wherever on it you pressed — a continuous
// position on 0–4, not one of five steps — because a setter who thinks a
// problem sits at the soft end of Black should be able to say so, and the
// average of a dozen such opinions is the point of collecting them.
//
// What is *not* analog is the answer. A boulder is White, Blue, Purple, Pink or
// Black, and which one it is comes from **where the average lands on the bar**:
// the bar is five equal bands, so the grade is the band the average falls in.
// That is a truncation, not a rounding, and the difference is the whole of the
// bug this replaces:
//
//   Two people vote low in Black — 3.25 and 3.30, both plainly inside the black
//   band, which starts at 3.2. Their average is 3.275, still inside it, and the
//   marker is drawn there. Rounding to the nearest whole index gives 3 — Pink.
//   The bar showed Black and every count said Pink, and both were reading the
//   same number.
//
// Truncating to the band the average sits in gives Black, which is what the bar
// has been showing all along and what the people voting meant.
//
// Rounding is wrong here for a reason worth stating: the whole numbers are not
// the grades. Index 4 is the *far right edge* of the bar, not the middle of
// Black — so "nearest whole number" asks which band **boundary** the average is
// closest to, which is not a question anybody was trying to answer.

/** The KBC scale: five bands. Must equal `GRADES.length` in services/boulders.ts. */
export const GRADE_BAND_COUNT = 5

/** The top of the analog scale — a vote runs from 0 to this. */
export const MAX_VOTE = GRADE_BAND_COUNT - 1

/**
 * The vote a press means: exactly where on the bar it landed.
 *
 * Analog and deliberately so. This briefly snapped to whole bands, which threw
 * away the shading a setter was trying to express.
 */
export function voteFromFraction(frac: number, bands: number = GRADE_BAND_COUNT): number {
  return Math.max(0, Math.min(1, frac)) * (bands - 1)
}

/** Where along the bar a vote sits, as a fraction of its width. */
export function fractionForVote(vote: number, bands: number = GRADE_BAND_COUNT): number {
  if (!Number.isFinite(vote)) return 0
  return Math.max(0, Math.min(bands - 1, vote)) / (bands - 1)
}

/**
 * The colour band a position on the bar falls in — the truncation.
 *
 * The bar is `bands` equal stripes, so this is which stripe you are looking at.
 * The last one takes its closing edge, since a vote of exactly `MAX_VOTE` is at
 * 100% and would otherwise fall off the end.
 */
export function gradeIndexFromPosition(
  position: number,
  bands: number = GRADE_BAND_COUNT,
): number {
  if (!Number.isFinite(position)) return 0
  return Math.min(bands - 1, Math.floor(fractionForVote(position, bands) * bands))
}

/**
 * The mean of the votes, on the same analog scale — where the marker goes.
 *
 * Null when nobody has voted: an ungraded boulder, not a White one.
 */
export function averageVotePosition(votes: readonly number[]): number | null {
  const usable = votes.filter((v) => Number.isFinite(v))
  if (usable.length === 0) return null
  return usable.reduce((sum, v) => sum + v, 0) / usable.length
}

/**
 * The boulder's grade: the band the average vote lands in.
 *
 * Averaged first, truncated second, and in that order. Truncating each vote
 * before averaging would be a different question — "how many people said
 * Black" rather than "where does this problem sit" — and it would throw away
 * the shading the analog bar exists to collect.
 */
export function averageGradeIndex(
  votes: readonly number[],
  bands: number = GRADE_BAND_COUNT,
): number | null {
  const mean = averageVotePosition(votes)
  return mean === null ? null : gradeIndexFromPosition(mean, bands)
}
