/**
 * One place for turning a date into text.
 *
 * These formats were reimplemented in nine files, and had drifted: two screens
 * hand-rolled a 12-hour clock (`${h % 12 || 12}:${min} ${ampm}` → "9:05 PM")
 * while the rest asked Intl for a 2-digit hour ("09:05 PM"), so the same event
 * read differently on the Schedule and in the Calendar list. Everything routes
 * through here now, on the no-leading-zero form.
 *
 * All of it is local-time and locale-aware: `[]` as the locales argument means
 * "the browser's locale", which is what every call site already passed.
 */

const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
const SHORT_DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
const MONTH_DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }
const LONG_DATE_YEAR: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
}
const DAY_HEADER: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

/** "9:05 PM" */
export function formatTime(value: Date | string): string {
  return toDate(value).toLocaleTimeString([], TIME)
}

/** "Jun 15, 2026" — the compact form used in tables and history rows. */
export function formatShortDate(value: Date | string): string {
  return toDate(value).toLocaleDateString([], SHORT_DATE)
}

/**
 * "Jun 15" — no year, for a byline sitting inline with other text where the
 * extra five characters cost more than the year is worth.
 */
export function formatMonthDay(value: Date | string): string {
  return toDate(value).toLocaleDateString([], MONTH_DAY)
}

/** "Monday, June 15" — headers for a day the year is obvious for. */
export function formatLongDate(value: Date | string): string {
  return toDate(value).toLocaleDateString([], LONG_DATE)
}

/** "Monday, June 15, 2026" */
export function formatLongDateWithYear(value: Date | string): string {
  return toDate(value).toLocaleDateString([], LONG_DATE_YEAR)
}

/** "Mon, Jun 15, 2026" — the sign-in book's day headers. */
export function formatDayHeaderDate(value: Date | string): string {
  return toDate(value).toLocaleDateString([], DAY_HEADER)
}

// ─── Relative day labels ─────────────────────────────────────────────────────
//
// Three screens each had their own today/tomorrow (or today/yesterday) check,
// two of them comparing `toDateString()` and one comparing midnight-normalised
// timestamps. Same answer, three ways of getting there.

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Midnight on the day `value` falls in, local time. */
export function startOfDay(value: Date | string = new Date()): Date {
  const d = toDate(value)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function shiftedDay(days: number, from: Date): Date {
  const d = new Date(from)
  d.setDate(from.getDate() + days)
  return d
}

/**
 * "Today" / "Tomorrow" / "Yesterday" when it applies, else null.
 *
 * Which neighbours are worth naming depends on the screen — a schedule looks
 * forward, a log book looks back — so the caller says which to consider.
 */
export function relativeDayLabel(
  value: Date | string,
  {
    past = false,
    future = false,
    now = new Date(),
  }: { past?: boolean; future?: boolean; now?: Date } = {},
): string | null {
  const d = toDate(value)
  if (isSameDay(d, now)) return 'Today'
  if (future && isSameDay(d, shiftedDay(1, now))) return 'Tomorrow'
  if (past && isSameDay(d, shiftedDay(-1, now))) return 'Yesterday'
  return null
}

/**
 * A relative label with the full date after it — "Today · Monday, June 15" —
 * falling back to the date alone when the day has no name of its own.
 */
export function formatDayWithRelative(
  value: Date | string,
  options: { past?: boolean; future?: boolean; now?: Date; separator?: string } = {},
): string {
  const { separator = ' · ', ...rest } = options
  const label = relativeDayLabel(value, rest)
  const date = formatLongDate(value)
  return label ? `${label}${separator}${date}` : date
}

/**
 * A timestamp as "Today 9:05 PM" / "Yesterday 9:05 PM" / "Jun 15, 2026 9:05 PM".
 */
export function formatRelativeDateTime(value: Date | string, now: Date = new Date()): string {
  if (!value) return ''
  const d = toDate(value)
  const label = relativeDayLabel(d, { past: true, now })
  const time = formatTime(d)
  return label ? `${label} ${time}` : `${formatShortDate(d)} ${time}`
}
