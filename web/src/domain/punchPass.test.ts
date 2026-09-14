import { describe, expect, it } from 'vitest'
import {
  FULL_PUNCH,
  HALF_PUNCH,
  canSpendPunches,
  formatPunchCount,
  formatPunches,
  hasPunchesLeft,
  normalizePunches,
  punchAccessType,
  punchPassName,
  spendPunches,
} from './punchPass'

describe('normalizePunches', () => {
  it('leaves whole and half balances alone', () => {
    expect(normalizePunches(10)).toBe(10)
    expect(normalizePunches(4.5)).toBe(4.5)
    expect(normalizePunches(0.5)).toBe(0.5)
  })

  it('snaps a value typed by hand to the nearest half', () => {
    expect(normalizePunches(4.3)).toBe(4.5)
    expect(normalizePunches(4.2)).toBe(4)
  })

  it('floors at zero, and treats nonsense as nothing', () => {
    expect(normalizePunches(-3)).toBe(0)
    expect(normalizePunches(Number.NaN)).toBe(0)
    expect(normalizePunches(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('canSpendPunches', () => {
  it('lets a half balance buy a half day but not a full one', () => {
    expect(canSpendPunches(0.5, HALF_PUNCH)).toBe(true)
    expect(canSpendPunches(0.5, FULL_PUNCH)).toBe(false)
  })

  it('lets a whole punch buy either', () => {
    expect(canSpendPunches(1, FULL_PUNCH)).toBe(true)
    expect(canSpendPunches(1, HALF_PUNCH)).toBe(true)
  })

  it('refuses an empty balance outright', () => {
    expect(canSpendPunches(0, HALF_PUNCH)).toBe(false)
    expect(hasPunchesLeft(0)).toBe(false)
    expect(hasPunchesLeft(0.5)).toBe(true)
  })
})

describe('spendPunches', () => {
  it('halves stay exact over a run of half-day visits', () => {
    let left = 10
    for (let i = 0; i < 20; i++) left = spendPunches(left, HALF_PUNCH)
    expect(left).toBe(0)
  })

  it('mixes full and half visits', () => {
    expect(spendPunches(spendPunches(3, FULL_PUNCH), HALF_PUNCH)).toBe(1.5)
  })

  it('never goes negative', () => {
    expect(spendPunches(0, FULL_PUNCH)).toBe(0)
    expect(spendPunches(0.5, FULL_PUNCH)).toBe(0)
  })
})

describe('formatting', () => {
  it('prints a whole balance without a decimal', () => {
    expect(formatPunchCount(4)).toBe('4')
    expect(formatPunches(4)).toBe('4 punches')
  })

  it('prints a half balance with one', () => {
    expect(formatPunchCount(4.5)).toBe('4.5')
    expect(formatPunches(4.5)).toBe('4.5 punches')
  })

  it('only exactly one punch is singular', () => {
    expect(formatPunches(1)).toBe('1 punch')
    expect(formatPunches(0.5)).toBe('0.5 punches')
    expect(formatPunches(1.5)).toBe('1.5 punches')
    expect(formatPunches(0)).toBe('0 punches')
  })
})

describe('sign-in book labels', () => {
  it('names the two kinds of punch', () => {
    expect(punchPassName(FULL_PUNCH)).toBe('Punch Pass')
    expect(punchPassName(HALF_PUNCH)).toBe('Half Punch Pass')
  })

  it('carries the balance left behind', () => {
    expect(punchAccessType(FULL_PUNCH, 4)).toBe('Punch Pass (4 left)')
    expect(punchAccessType(HALF_PUNCH, 4.5)).toBe('Half Punch Pass (4.5 left)')
  })
})
