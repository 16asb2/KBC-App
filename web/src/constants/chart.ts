import { KBC } from '@/constants/theme'

// Colour decisions for the summary charts. Kept out of the component file so
// that file exports only components (the fast-refresh rule), and here rather
// than in theme.ts because these encode *data*, not brand.

/**
 * Sends against attempts.
 *
 * This pairing was measured, not chosen by eye. The app's usual green/orange
 * for sent/tried comes out at ΔE 5.1 under deuteranopia — below the ΔE 6 floor
 * — so in a stacked bar a red-green colourblind climber could not tell the two
 * apart, which is the one thing the chart exists to show. Green against this
 * grey is 12.7 under deuteranopia and 19.5 in normal vision.
 *
 * The grey is not a third identity colour, it is de-emphasis: sends are the
 * story and attempts are the context behind them. Green sits at 2.5:1 on white,
 * under the 3:1 floor for a mark, so every bar carries its total as a visible
 * label — that label is what permits the softer colour.
 */
export const SENDS_COLOR = KBC.green
export const ATTEMPTS_COLOR = '#8a8f98'

/**
 * Cell shading for the grade × wall table: one hue, light to dark.
 *
 * Magnitude gets a single hue precisely so the shading reads as "how many"
 * rather than as a set of unrelated categories — a rainbow here would invent
 * six meanings that aren't in the data.
 */
export function cellFill(count: number, busiest: number): { background: string; color: string } {
  if (count === 0) return { background: 'transparent', color: '#c9c9c9' }
  const ratio = busiest > 0 ? count / busiest : 0
  // Floored at 12% so a single boulder still reads as present rather than blank.
  const alpha = 0.12 + ratio * 0.68
  // rgba over the white cell, not color-mix(): the latter needs a 2023-era
  // engine, and where it is missing the declaration is dropped rather than
  // approximated — every cell would come out blank, which is exactly the kind
  // of failure nobody notices until the table looks empty on someone's phone.
  return {
    background: `rgba(${rgb(KBC.cyan)}, ${alpha.toFixed(2)})`,
    color: alpha > 0.55 ? '#fff' : '#1f2933',
  }
}

/** "#007dab" → "0, 125, 171", so a token can be used at partial opacity. */
function rgb(hex: string): string {
  const h = hex.replace('#', '')
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16,
  )
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}
