import type { EmergencyContact, UserProfile } from '@/types/member'

// What counts as a finished member record, and what is still missing from one.
//
// This exists because a profile can now arrive half-filled: an admin importing
// a CSV in admin-web/ creates the member ahead of their first sign-in, and the
// spreadsheet may not have carried an emergency contact. The app has to notice
// that and ask, rather than letting someone climb on a record with no next of
// kin on it.

/**
 * `emergencyContact` is stored as a JSON *string*, not a map — see the
 * data-format constraint in web/CLAUDE.md. Anything unparseable is treated as
 * absent rather than thrown, because a half-written record is exactly the case
 * this module is here to detect.
 */
export function parseEmergencyContact(raw: string | undefined | null): EmergencyContact | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<EmergencyContact>
    if (!parsed || typeof parsed !== 'object') return null
    return {
      name: (parsed.name ?? '').trim(),
      relationship: (parsed.relationship ?? '').trim(),
      phone: (parsed.phone ?? '').trim(),
    }
  } catch {
    return null
  }
}

/** A field the member still has to supply, with wording fit to show them. */
export type MissingField = {
  key:
    'legalName' | 'emergencyContactName' | 'emergencyContactRelationship' | 'emergencyContactPhone'
  label: string
}

const EC_FIELDS: { key: MissingField['key']; label: string; of: keyof EmergencyContact }[] = [
  { key: 'emergencyContactName', label: 'Emergency contact name', of: 'name' },
  {
    key: 'emergencyContactRelationship',
    label: 'Emergency contact relationship',
    of: 'relationship',
  },
  { key: 'emergencyContactPhone', label: 'Emergency contact phone', of: 'phone' },
]

/**
 * Everything still needed before a profile is usable.
 *
 * Deliberately the same list `NewMemberSetupPage` validates on, so the app can
 * never send someone to a form that then tells them they are already done.
 * Preferred name and the member's own phone stay optional — they are nice to
 * have, not a reason to stop somebody climbing.
 *
 * Waivers are not checked here. They are their own step in `OnboardingGate`,
 * and an import can never satisfy them: a waiver has to be signed, not typed
 * into a spreadsheet by somebody else.
 */
export function missingProfileFields(
  profile: Pick<UserProfile, 'legalName' | 'emergencyContact'> | null | undefined,
): MissingField[] {
  if (!profile) return []
  const missing: MissingField[] = []
  if (!profile.legalName?.trim()) missing.push({ key: 'legalName', label: 'Legal name' })

  const ec = parseEmergencyContact(profile.emergencyContact)
  for (const f of EC_FIELDS) {
    if (!ec?.[f.of]?.trim()) missing.push({ key: f.key, label: f.label })
  }
  return missing
}

/** True once there is nothing left to ask the member for. */
export function isProfileComplete(
  profile: Pick<UserProfile, 'legalName' | 'emergencyContact'> | null | undefined,
): boolean {
  return !!profile && missingProfileFields(profile).length === 0
}

/**
 * True while the member still has to visit the setup form.
 *
 * Two different reasons land here. The first is the old one: something the app
 * insists on is missing. The second is new — a record that was written *for*
 * someone, by a CSV import or a supervisor at the desk, may be complete without
 * its owner ever having laid eyes on it. A spreadsheet can be wrong about a
 * phone number or an emergency contact and nobody would know, so the first
 * sign-in shows them the form filled in with what is on file and asks them to
 * confirm it before they sign a waiver against it.
 *
 * `profileReviewedAt` records that confirmation. Members who onboarded before
 * that field existed are recognised by `waiverMembership`: an import cannot
 * write a waiver, so anyone holding one has already been through this form.
 * Without that clause every existing member would be marched back through
 * setup the next time they opened the app.
 */
export function needsProfileReview(
  profile:
    | Pick<
        UserProfile,
        'legalName' | 'emergencyContact' | 'profileReviewedAt' | 'waiverMembership'
      >
    | null
    | undefined,
): boolean {
  if (!profile) return true
  if (!isProfileComplete(profile)) return true
  if (profile.profileReviewedAt) return false
  return !profile.waiverMembership
}

/**
 * A legal name reduced to something two spellings of the same person share:
 * case, accents and runs of whitespace all stop mattering. Deliberately no
 * more than that — dropping punctuation would fold "O'Neill" into "ONeill" and
 * start matching people who are not each other.
 */
export function normaliseLegalName(name: string | undefined | null): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Whether a stored record is one nobody has ever signed into.
 *
 * Only such a record may be claimed by legal name (see
 * `findClaimableByLegalName`). A waiver, a sign-in or a confirmed profile all
 * mean a real person has used the account, and a matching name is nowhere near
 * enough to take it from them — `profileReviewedAt` covers the member who
 * completed the setup form and then wandered off before signing anything.
 * Privileged records are excluded outright: a name is public knowledge, so
 * letting one be claimed would hand supervisor rights to whoever typed it.
 *
 * Kept in step with `claimedByLegalName()` in firestore.rules, which decides
 * whether the superseded document may then be deleted.
 */
export function isClaimablePreRegistration(
  profile: Pick<
    UserProfile,
    | 'waiverMembership'
    | 'waiverLiability'
    | 'lastSignInAt'
    | 'profileReviewedAt'
    | 'isAdmin'
    | 'isSupervisor'
  >,
): boolean {
  return (
    !profile.waiverMembership &&
    !profile.waiverLiability &&
    !profile.lastSignInAt &&
    !profile.profileReviewedAt &&
    !profile.isAdmin &&
    !profile.isSupervisor
  )
}

/**
 * The pre-registered record a member is entitled to claim by typing their legal
 * name into the setup form.
 *
 * The case: they are on the imported list, but they sign in with a Google
 * account whose address is not the one in the spreadsheet, so
 * `findOrLinkProfile`'s email lookup finds nothing and they arrive at setup as
 * a stranger. Their legal name is what identifies them instead.
 *
 * Ambiguity is answered with `null`, never a guess. Two unclaimed records
 * sharing a legal name are two people as far as this function is concerned, and
 * picking one of them would hand a member somebody else's membership.
 */
export function findClaimableByLegalName<
  T extends Pick<
    UserProfile,
    | 'uid'
    | 'legalName'
    | 'waiverMembership'
    | 'waiverLiability'
    | 'lastSignInAt'
    | 'profileReviewedAt'
    | 'isAdmin'
    | 'isSupervisor'
  >,
>(profiles: T[], legalName: string, excludeUid: string): T | null {
  const target = normaliseLegalName(legalName)
  if (!target) return null
  const matches = profiles.filter(
    (p) =>
      p.uid !== excludeUid &&
      normaliseLegalName(p.legalName) === target &&
      isClaimablePreRegistration(p),
  )
  return matches.length === 1 ? matches[0] : null
}

/**
 * The claimed record's address kept alongside the new one rather than dropped.
 *
 * Claiming replaces `email` with the Google account actually signing in, and
 * the address the gym had on file for them is worth keeping — it is how they
 * appear on older receipts and in the sheet the import came from.
 */
export function mergeAdditionalEmails(
  stored: string | undefined,
  oldEmail: string | undefined,
  newEmail: string,
): string[] {
  let list: string[] = []
  try {
    const parsed = JSON.parse(stored || '[]')
    if (Array.isArray(parsed)) list = parsed.filter((e): e is string => typeof e === 'string')
  } catch {
    list = []
  }
  const old = (oldEmail ?? '').toLowerCase().trim()
  const known = new Set([newEmail.toLowerCase().trim(), ...list.map((e) => e.toLowerCase().trim())])
  if (old && !known.has(old)) list.push(old)
  return list
}
