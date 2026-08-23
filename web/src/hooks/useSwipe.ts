import { useRef, type TouchEvent } from 'react'

// Horizontal swipe for the Schedule and Calendar pages. mobile got this from
// react-native-gesture-handler; on the web it's three touch handlers, so it is
// hand-rolled rather than pulling in a gesture library for one interaction.

/** Minimum horizontal travel, in px, before a touch counts as a swipe. */
const DEFAULT_THRESHOLD = 50

/**
 * Which way a touch travelled, or null if it doesn't count as a horizontal
 * swipe.
 *
 * The `|dx| > |dy|` test is what keeps this from fighting vertical scrolling:
 * a finger dragging down the page always moves further vertically than
 * horizontally, so it never registers. Split out from the hook so the decision
 * can be tested without synthesising touch events.
 */
export function swipeDirection(
  dx: number,
  dy: number,
  threshold = DEFAULT_THRESHOLD,
): 'left' | 'right' | null {
  if (Math.abs(dx) < threshold) return null
  if (Math.abs(dx) <= Math.abs(dy)) return null
  return dx < 0 ? 'left' : 'right'
}

export type SwipeHandlers = {
  onTouchStart: (e: TouchEvent) => void
  onTouchEnd: (e: TouchEvent) => void
}

/**
 * Returns props to spread onto the element that should respond to swipes.
 *
 *   const swipe = useSwipe({ onSwipeLeft: next, onSwipeRight: prev })
 *   <div {...swipe}>…</div>
 *
 * Deliberately does not preventDefault: the page must still scroll vertically
 * and pinch-zoom normally, and a swipe is only recognised after the finger
 * lifts.
 */
export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = DEFAULT_THRESHOLD,
}: {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
}): SwipeHandlers {
  const start = useRef<{ x: number; y: number } | null>(null)

  return {
    onTouchStart(e) {
      // Ignore multi-touch — that's a pinch, not a swipe.
      if (e.touches.length !== 1) {
        start.current = null
        return
      }
      const t = e.touches[0]
      start.current = { x: t.clientX, y: t.clientY }
    },
    onTouchEnd(e) {
      const from = start.current
      start.current = null
      if (!from) return
      const t = e.changedTouches[0]
      if (!t) return
      const dir = swipeDirection(t.clientX - from.x, t.clientY - from.y, threshold)
      if (dir === 'left') onSwipeLeft?.()
      else if (dir === 'right') onSwipeRight?.()
    },
  }
}
