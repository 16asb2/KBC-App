/**
 * Up to two initials, for the avatar circles.
 *
 * Written out three times across the pages, and null-safe here where those
 * weren't: `name` is absent on a record written by hand rather than by this app
 * or admin-web/ (see the sort in services/profiles.ts#getAllProfiles), and
 * `undefined.split` would take out the whole member list over one malformed
 * document.
 */
export function initials(name: string | null | undefined): string {
  return (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
