export const KBC = {
  pink: '#c0005a',
  black: '#0a0a0a',
  darkGrey: '#1c1c1c',
  green: '#4db847',
  cyan: '#00b4d8',
  purple: '#9b5de5',
  white: '#ffffff',
  orange: '#f97316',
  lime: '#84cc16',
  /**
   * The "happening right now" green — the timeline's current-time line and the
   * marker on your own grade vote. Deliberately not `green`, which is the
   * brand's: this one is brighter so it reads as live against a busy day view.
   */
  live: '#00e676',
  /** Page-grey behind the timeline grid, so the white event area stands out. */
  surface: '#f7f7f7',
}

/**
 * A translucent wash of a colour, for the chip and pill backgrounds that pair a
 * tinted fill with the same colour as text.
 *
 * This was written inline as `KBC.orange + '22'` in five places — an
 * eight-digit hex colour, where the trailing byte is the alpha. Naming it means
 * the intent survives, and a caller can't reach for a slightly different `'20'`
 * next time.
 */
export function tint(color: string): string {
  return `${color.slice(0, 7)}22`
}

/** A fainter wash still — enough to shade a whole table row without shouting. */
export function faintTint(color: string): string {
  return `${color.slice(0, 7)}0d`
}
