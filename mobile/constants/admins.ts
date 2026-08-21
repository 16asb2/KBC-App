// Super-admin account — irrevocable, cannot be modified or removed in-app.
// Set EXPO_PUBLIC_SUPER_ADMIN_EMAIL in your .env (and EAS env vars for builds).
export const SUPER_ADMIN_EMAIL = (process.env.EXPO_PUBLIC_SUPER_ADMIN_EMAIL ?? '').toLowerCase();

/**
 * Returns true if the user is an admin.
 * Two sources of truth:
 *  1. Email matches SUPER_ADMIN_EMAIL (hardcoded, irrevocable)
 *  2. Firestore profile.isAdmin === true (dynamically managed by other admins)
 *
 * Always pass profile?.isAdmin as the second arg for a complete check.
 */
export function isAdmin(
  email: string | null | undefined,
  profileIsAdmin?: boolean,
): boolean {
  if (SUPER_ADMIN_EMAIL && email && email.toLowerCase() === SUPER_ADMIN_EMAIL) return true;
  return profileIsAdmin === true;
}
