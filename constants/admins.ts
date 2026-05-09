// Super-admin account — irrevocable, cannot be modified or removed in-app
// Replace with KBC google account email before public release
export const SUPER_ADMIN_EMAIL = '16asb2@gmail.com';

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
  if (!!email && email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) return true;
  return profileIsAdmin === true;
}
