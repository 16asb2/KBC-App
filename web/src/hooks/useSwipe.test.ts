import { describe, expect, it } from 'vitest'
import { swipeDirection } from './useSwipe'

describe('swipeDirection', () => {
  it('reads a clear leftward drag as left', () => {
    expect(swipeDirection(-120, 5)).toBe('left')
  })

  it('reads a clear rightward drag as right', () => {
    expect(swipeDirection(120, -5)).toBe('right')
  })

  it('ignores a drag shorter than the threshold', () => {
    expect(swipeDirection(-30, 0)).toBeNull()
  })

  it('honours a custom threshold', () => {
    expect(swipeDirection(-30, 0, 20)).toBe('left')
  })

  it('ignores a vertical scroll that drifts sideways', () => {
    // The case that matters: scrolling the page down with a slightly diagonal
    // finger must not flip the day.
    expect(swipeDirection(60, 200)).toBeNull()
  })

  it('ignores a purely vertical drag', () => {
    expect(swipeDirection(0, 300)).toBeNull()
  })

  it('ignores a diagonal drag at exactly 45 degrees', () => {
    expect(swipeDirection(100, 100)).toBeNull()
  })

  it('accepts a diagonal drag that is mostly horizontal', () => {
    expect(swipeDirection(100, 99)).toBe('right')
  })

  it('treats a stationary tap as no swipe', () => {
    expect(swipeDirection(0, 0)).toBeNull()
  })
})
