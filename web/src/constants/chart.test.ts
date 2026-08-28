import { describe, expect, it } from 'vitest'
import { cellFill } from './chart'

describe('cellFill', () => {
  it('leaves an empty cell unshaded', () => {
    expect(cellFill(0, 5).background).toBe('transparent')
  })

  it('shades darker as the count rises', () => {
    const alpha = (s: string) => Number(s.match(/,\s*([0-9.]+)\)$/)![1])
    expect(alpha(cellFill(5, 5).background)).toBeGreaterThan(alpha(cellFill(1, 5).background))
  })

  it('emits rgba, which every engine understands', () => {
    expect(cellFill(3, 5).background).toMatch(/^rgba\(\d+, \d+, \d+, [0-9.]+\)$/)
  })

  it('flips the text to white once the fill is dark enough to need it', () => {
    expect(cellFill(5, 5).color).toBe('#fff')
    expect(cellFill(1, 20).color).toBe('#1f2933')
  })

  it('does not divide by zero on an empty season', () => {
    expect(cellFill(1, 0).background).toMatch(/^rgba\(/)
  })
})
