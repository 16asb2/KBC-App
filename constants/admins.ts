// Board members who can grant/revoke supervisor status
// Add the Google account emails of KBC board members here
export const ADMIN_EMAILS: string[] = [
  '16asb2@gmail.com',
];

export function isAdmin(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email.toLowerCase());
}
