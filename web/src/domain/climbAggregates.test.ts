import { describe, expect, it } from 'vitest'
import { computeAggregates, getPersonalStatus } from './climbAggregates'
import type { PersonalClimb } from '@/services/climblog'

function log(overrides: Partial<PersonalClimb>): PersonalClimb {
  return {
    id: overrides.id ?? Math.random().toString(),
    uid: 'u1',
    hasPhoto: false,
    locationId: 'kbc',
    boulderId: 'b1',
    sectorId: '',
    timestamp: '2026-06-01T00:00:00.000Z',
    name: '',
    establishedGrade: '',
    personalGrade: '',
    gradeVote: null,
    problemInternalId: 'p1',
    quality: 0,
    effort: '',
    type: 'ascent',
    project: false,
    attempts: 0,
    badges: [],
    comment: '',
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('computeAggregates', () => {
  it('counts sends vs attempts', () => {
    const logs = [log({ type: 'ascent' }), log({ type: 'ascent' }), log({ type: 'attempt' })]
    const agg = computeAggregates(logs)
    expect(agg.sendCount).toBe(2)
    expect(agg.attemptCount).toBe(1)
  })

  it('averages grade votes, including the setter initial vote', () => {
    const logs = [log({ gradeVote: 2 }), log({ gradeVote: 4 })]
    const agg = computeAggregates(logs, 0)
    expect(agg.avgGrade).toBe(2) // (0 + 2 + 4) / 3
  })

  it('returns null avgGrade with no votes', () => {
    const agg = computeAggregates([log({ gradeVote: null })])
    expect(agg.avgGrade).toBeNull()
  })

  it('counts sends and attempts together as climbedCount', () => {
    const agg = computeAggregates([
      log({ type: 'ascent' }),
      log({ type: 'attempt' }),
      log({ type: 'attempt' }),
    ])
    expect(agg).toMatchObject({ sendCount: 1, attemptCount: 2, climbedCount: 3 })
  })

  it('reports a climbedCount of 0 for a problem nobody has touched', () => {
    // The setter's own grade vote and badge picks are not a climb — a brand
    // new problem must not read as already having traffic on it.
    expect(computeAggregates([], 2, ['Crimps']).climbedCount).toBe(0)
  })

  it('ranks top badges by frequency, counting setter picks', () => {
    const logs = [log({ badges: ['Crimps', 'Dyno'] }), log({ badges: ['Crimps'] })]
    const agg = computeAggregates(logs, null, ['Slopers'])
    expect(agg.topBadges[0]).toBe('Crimps')
    expect(agg.topBadges).toContain('Slopers')
  })
})

describe('getPersonalStatus', () => {
  it('returns the first log matching the uid (assumes desc-sorted input)', () => {
    const logs = [log({ uid: 'u2', id: 'a' }), log({ uid: 'u1', id: 'b' }), log({ uid: 'u1', id: 'c' })]
    expect(getPersonalStatus(logs, 'u1')?.id).toBe('b')
  })

  it('returns null when the user has no logs', () => {
    expect(getPersonalStatus([log({ uid: 'other' })], 'u1')).toBeNull()
  })
})
