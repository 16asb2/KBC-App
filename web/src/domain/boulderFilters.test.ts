import { describe, expect, it } from 'vitest'
import { boulderFilterCount, DEFAULT_BOULDER_FILTER } from './boulderFilters'

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
