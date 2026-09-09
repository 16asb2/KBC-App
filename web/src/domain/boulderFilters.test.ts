import { describe, expect, it } from 'vitest'
import { boulderFilterCount, DEFAULT_BOULDER_FILTER, popularityScore } from './boulderFilters'

describe('boulderFilterCount', () => {
  it('is 0 for the default filter', () => {
    expect(boulderFilterCount(DEFAULT_BOULDER_FILTER)).toBe(0)
  })

  it('counts each active dimension', () => {
    expect(
      boulderFilterCount({
        ...DEFAULT_BOULDER_FILTER,
        locations: ['Cave Left', 'Cave Right'],
        grades: [1],
        setter: 'Jane',
        projectsOnly: true,
      }),
    ).toBe(5) // 2 locations + 1 grade + 1 setter + 1 projectsOnly
  })
})

describe('popularityScore', () => {
  it('adds likes and climbs together', () => {
    expect(popularityScore(3, 7)).toBe(10)
  })

  it('gives a problem with only likes and one with only climbs the same standing', () => {
    // The two inputs are deliberately unweighted — see the doc comment. This
    // pins that down, so a later "likes should count double" is a decision
    // someone makes on purpose rather than a silent drift.
    expect(popularityScore(5, 0)).toBe(popularityScore(0, 5))
  })

  it('is 0 for an untouched problem', () => {
    expect(popularityScore(0, 0)).toBe(0)
  })
})
