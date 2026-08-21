import { describe, expect, it } from 'vitest'
import { climbFilterCount, DEFAULT_CLIMB_FILTER, filterAndSortClimbs, groupClimbsByDate } from './climbLogFilter'
import type { PersonalClimb } from '@/services/climblog'

function climb(overrides: Partial<PersonalClimb>): PersonalClimb {
  return {
    id: overrides.id ?? Math.random().toString(),
    uid: 'u1',
    locationId: 'kbc',
    boulderId: '',
    sectorId: '',
    timestamp: '2026-06-01T10:00:00.000Z',
    name: 'Climb',
    establishedGrade: '',
    personalGrade: '',
    gradeVote: null,
    problemInternalId: '',
    quality: 0,
    effort: '',
    type: 'ascent',
    project: false,
    attempts: 1,
    badges: [],
    comment: '',
    createdAt: '2026-06-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('climbFilterCount', () => {
  it('is 0 for the default filter', () => {
    expect(climbFilterCount(DEFAULT_CLIMB_FILTER)).toBe(0)
  })

  it('counts type + projectsOnly', () => {
    expect(climbFilterCount({ type: 'sent', projectsOnly: true, sort: 'newest' })).toBe(2)
  })
})

describe('filterAndSortClimbs', () => {
  const climbs = [
    climb({ id: 'a', type: 'ascent', name: 'Banana', quality: 2, timestamp: '2026-06-01T10:00:00.000Z' }),
    climb({ id: 'b', type: 'attempt', name: 'Apple', quality: 3, project: true, timestamp: '2026-06-02T10:00:00.000Z' }),
  ]

  it('filters by type', () => {
    expect(filterAndSortClimbs(climbs, { type: 'sent', projectsOnly: false, sort: 'newest' }).map((c) => c.id)).toEqual(['a'])
  })

  it('filters projects only', () => {
    expect(filterAndSortClimbs(climbs, { type: 'all', projectsOnly: true, sort: 'newest' }).map((c) => c.id)).toEqual(['b'])
  })

  it('sorts newest first by default', () => {
    expect(filterAndSortClimbs(climbs, DEFAULT_CLIMB_FILTER).map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('sorts by quality descending', () => {
    expect(filterAndSortClimbs(climbs, { type: 'all', projectsOnly: false, sort: 'quality' }).map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('sorts name A-Z', () => {
    expect(filterAndSortClimbs(climbs, { type: 'all', projectsOnly: false, sort: 'name-az' }).map((c) => c.id)).toEqual(['b', 'a'])
  })
})

describe('groupClimbsByDate', () => {
  it('inserts a header per distinct date when sorted by date', () => {
    const climbs = [
      climb({ id: 'a', timestamp: '2026-06-02T10:00:00.000Z' }),
      climb({ id: 'b', timestamp: '2026-06-01T10:00:00.000Z' }),
      climb({ id: 'c', timestamp: '2026-06-01T09:00:00.000Z' }),
    ]
    const items = groupClimbsByDate(climbs, 'newest')
    expect(items.filter((i) => i.type === 'header')).toHaveLength(2)
    expect(items).toHaveLength(5) // 2 headers + 3 climbs
  })

  it('has no headers when sorted by name', () => {
    const climbs = [climb({ id: 'a' }), climb({ id: 'b' })]
    const items = groupClimbsByDate(climbs, 'name-az')
    expect(items.every((i) => i.type === 'climb')).toBe(true)
  })
})
