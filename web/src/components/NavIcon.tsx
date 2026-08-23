// Tab-bar icons. Inline SVG (no icon dependency), stroked with `currentColor`
// so each icon inherits the NavLink's colour — the active tab's KBC colour when
// selected, muted grey otherwise. Replaces the coloured-dot placeholders and
// stands in for mobile's SF Symbols (house.fill, clock.fill, calendar,
// person.2.fill, figure.climbing, book.fill).

export type NavIconName = 'home' | 'clock' | 'calendar' | 'people' | 'climbing' | 'book'

const PATHS: Record<NavIconName, React.ReactNode> = {
  home: (
    <>
      <path d="M3 10.2 12 3.5l9 6.7V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M9.25 21v-6.5h5.5V21" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M12 6.75V12l3.5 2.25" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.25" y="5" width="17.5" height="16" rx="2.25" />
      <path d="M8 2.75V6.5M16 2.75V6.5M3.25 10.25h17.5" />
    </>
  ),
  people: (
    <>
      <circle cx="9.25" cy="8.25" r="3.5" />
      <path d="M2.75 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16.5 5.2a3.5 3.5 0 0 1 0 6.6" />
      <path d="M18.4 20a6.4 6.4 0 0 0-2.6-4.35" />
    </>
  ),
  // A boulder/peak — the closest legible stand-in for figure.climbing at 24px.
  climbing: (
    <>
      <path d="M2.75 20h18.5L14.4 7.5 11 13.25 8.75 10z" />
      <circle cx="16.75" cy="4.75" r="1.6" />
    </>
  ),
  book: (
    <>
      <path d="M4.25 5.25A2.5 2.5 0 0 1 6.75 2.75H20v18.5H6.75a2.5 2.5 0 0 1-2.5-2.5z" />
      <path d="M4.25 17.5H20" />
    </>
  ),
}

export function NavIcon({ name, size = 22 }: { name: NavIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      {PATHS[name]}
    </svg>
  )
}
