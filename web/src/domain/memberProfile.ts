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
 * The record the gym already holds for the person signing in, matched on either
 * of the two things they and their record can be expected to share.
 *
 * **Email first**, because it is the strong one: it is what the account
 * actually proves, and what `firestore.rules` can re-check independently.
 *
 * **Then legal name**, because email alone was not enough. A record entered
 * under a personal address, or an address the member has since stopped using,
 * is invisible to an email match — and the app's answer to that was to treat a
 * member of years' standing as somebody it had never met, which is how a live
 * membership came to be replaced by a blank one.
 *
 * The names are tried in the order given: the legal name the member typed into
 * the setup form first, if there is one, then whatever Google reports as their
 * account name, which is a real full name often enough to be worth asking.
 *
 * Two rules survive from the narrower version this replaces, and neither is
 * negotiable:
 *
 * - **Ambiguity is not a match.** Two records under one legal name are two
 *   people until somebody says otherwise, and handing over the wrong one gives
 *   a member somebody else's membership.
 * - **A name match never carries isAdmin or isSupervisor.** A legal name is
 *   public knowledge around a gym. `firestore.rules` enforces this
 *   independently — a name-matched write reaches only the self-create branch,
 *   which rejects a document arriving with either flag set — so the caller must
 *   clear them or the write is refused outright.
 *
 * What is deliberately *not* checked any more is whether the record looks
 * untouched. It used to require no waiver, no sign-in and no confirmation by
 * its owner, which sounds prudent and meant that the records most worth finding
 * — real members, with real history — were the exact ones it would not find.
 */
export function findExistingRecord<
  T extends Pick<UserProfile, 'uid' | 'email' | 'legalName'>,
>(profiles: T[], email: string, names: (string | undefined | null)[], excludeUid: string): T | null {
  const candidates = profiles.filter((p) => p.uid !== excludeUid)

  const byEmail = findProfileByEmailIn(candidates, email)
  if (byEmail) return byEmail

  for (const name of names) {
    const target = normaliseLegalName(name)
    if (!target) continue
    const matches = candidates.filter((p) => normaliseLegalName(p.legalName) === target)
    if (matches.length === 1) return matches[0]
  }
  return null
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

/** An email reduced to what two spellings of the same address share. */
export function normaliseEmail(email: string | undefined | null): string {
  return (email ?? '').trim().toLowerCase()
}

/**
 * The stored record for an address, compared case-insensitively.
 *
 * `services/profiles.ts` asks Firestore first, with an equality filter on the
 * lowercased address — but that only ever matches a record whose *stored* value
 * is already lower case. `admin-web/` is careful about this, and a list loaded
 * into Firestore by any other route (the console, a one-off script, an older
 * importer) need not be: one row saved as `Jane@Example.com` is invisible to
 * that query, and the member registers from scratch beside the membership they
 * paid for. `firestore.rules` has always compared these addresses with
 * `.lower()` on both sides, so the rules were the only half of the join that
 * was case-insensitive.
 *
 * Duplicates take the first match, which is what the `limit(1)` query it backs
 * up would have done. Two records for one address is a data fault for an admin
 * to resolve, not something to decide here.
 */
export function findProfileByEmailIn<T extends Pick<UserProfile, 'email'>>(
  profiles: T[],
  email: string,
): T | null {
  const target = normaliseEmail(email)
  if (!target) return null
  return profiles.find((p) => normaliseEmail(p.email) === target) ?? null
}
