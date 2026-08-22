import { describe, expect, it } from 'vitest'
import { computeAggregates, getPersonalStatus } from './climbAggregates'
import type { PersonalClimb } from '@/services/climblog'

function log(overrides: Partial<PersonalClimb>): PersonalClimb {
  return {
    id: overrides.id ?? Math.random().toString(),
    uid: 'u1',
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

  it('returns null avgGrade/avgQuality with no votes', () => {
    const agg = computeAggregates([log({ gradeVote: null, quality: 0 })])
    expect(agg.avgGrade).toBeNull()
    expect(agg.avgQuality).toBeNull()
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
