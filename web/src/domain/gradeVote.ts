// What a stored grade vote means.
//
// The grade bar is five equal colour bands — White, Blue, Purple, Pink, Black —
// and a vote is which band the voter pressed. That is the whole idea, and the
// two clients disagreed about how to write it down:
//
//   admin-web/  stored the BAND INDEX:      Math.min(4, Math.floor(frac * 5))
//   web/        stored a POSITION on 0–4:   (x / width) * 4
//
// Into the same `gradeVotes` map and the same `setterGradeVote` field. The
// second is skewed against its own bar: pressing the middle of Black is 90% of
// the way along, which the app wrote down as 3.6, and pressing just inside
// Black wrote down 3.2. Every count then rounds — `Math.round(3.2)` is 3 — so a
// boulder two people had marked **Black** was counted, filtered and summarised
// as **Pink**, while the bar went on drawing the marker at `3.2 / 4` = 80% of
// the way along, which is inside the Black band. The screen said one thing and
// every number said another, and both were reading the same field.
//
// A vote is an index here, and this module is the one place that decides so.

/** The KBC scale: five bands. Must equal `GRADES.length` in services/boulders.ts. */
export const GRADE_BAND_COUNT = 5

/**
 * The band a press landed in, as a fraction of the bar's width.
 *
 * This is what a vote *is* — press anywhere in Black and you have voted Black,
 * exactly as `admin-web/` has always recorded it. The last band takes the
 * closing edge, since `frac` of 1 would otherwise fall off the end.
 */
export function gradeFromFraction(frac: number, bands: number = GRADE_BAND_COUNT): number {
  const clamped = Math.max(0, Math.min(1, frac))
  return Math.min(bands - 1, Math.floor(clamped * bands))
}

/**
 * Where to draw a mark standing for grade `index` — the centre of its band.
 *
 * The old marker sat at `index / (bands - 1)`, which puts White hard against
 * the left edge, Black hard against the right, and every fractional average
 * roughly one band too far right. Centre is the only position that means "this
 * grade" rather than "this far along".
 */
export function fractionForGrade(index: number, bands: number = GRADE_BAND_COUNT): number {
  const clamped = Math.max(0, Math.min(bands - 1, index))
  return (clamped + 0.5) / bands
}

/**
 * A stored vote read as the band its voter pressed.
 *
 * Legacy votes are positions on 0–4 written by the old bar, so they are put
 * back through that bar: 3.4 was a press at 85% of the way along, which is
 * Black. Whole numbers are left exactly where they are — `snap(3)` is 3 — so
 * every vote `admin-web/` ever wrote, and every vote written from here on, is a
 * fixed point. That is what makes this safe to apply to the whole history
 * rather than only to new votes: it cannot move a vote that was already an
 * index, and for the rest it recovers what the person actually pressed.
 */
export function gradeIndexFromVote(vote: number, bands: number = GRADE_BAND_COUNT): number {
  if (!Number.isFinite(vote)) return 0
  return gradeFromFraction(Math.max(0, Math.min(bands - 1, vote)) / (bands - 1), bands)
}

/**
 * The community's grade: every vote read as a band, averaged.
 *
 * Snapping happens per vote and before the average, not after. Two people
 * pressing Black average to Black; two Pinks and a Black average to Pink,
 * which is the right answer and the one a straight average of the raw
 * positions could not give.
 *
 * Returns null when nobody has voted — an ungraded boulder, not a White one.
 */
export function averageGradeIndex(
  votes: readonly number[],
  bands: number = GRADE_BAND_COUNT,
): number | null {
  const usable = votes.filter((v) => Number.isFinite(v))
  if (usable.length === 0) return null
  const mean = usable.reduce((sum, v) => sum + gradeIndexFromVote(v, bands), 0) / usable.length
  return Math.round(Math.max(0, Math.min(bands - 1, mean)))
}
