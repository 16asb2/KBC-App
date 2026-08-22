/**
 * Pure admin check, parameterized on the super-admin email so it's testable
 * without mocking Vite's import.meta.env.
 *
 * Two sources of truth:
 *  1. email matches superAdminEmail (hardcoded, irrevocable)
 *  2. profileIsAdmin === true (dynamically managed via Firestore by other admins)
 */
export function isAdminFor(
  email: string | null | undefined,
  profileIsAdmin: boolean | undefined,
  superAdminEmail: string,
): boolean {
  if (superAdminEmail && email && email.toLowerCase() === superAdminEmail.toLowerCase()) {
    return true
  }
  return profileIsAdmin === true
}

// Super-admin account — irrevocable, cannot be modified or removed in-app.
// Set VITE_SUPER_ADMIN_EMAIL in your .env.
export const SUPER_ADMIN_EMAIL = (import.meta.env.VITE_SUPER_ADMIN_EMAIL ?? '').toLowerCase()

/** Always pass profile?.isAdmin as the second arg for a complete check. */
export function isAdmin(email: string | null | undefined, profileIsAdmin?: boolean): boolean {
  return isAdminFor(email, profileIsAdmin, SUPER_ADMIN_EMAIL)
}

export function isPrivileged(
  email: string | null | undefined,
  profile: { isAdmin?: boolean; isSupervisor?: boolean } | null | undefined,
): boolean {
  return isAdmin(email, profile?.isAdmin) || profile?.isSupervisor === true
}
