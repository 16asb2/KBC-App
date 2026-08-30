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
