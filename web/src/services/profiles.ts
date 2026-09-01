import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { nextAccessPass } from '@/domain/membership'
import {
  findExistingRecord,
  mergeAdditionalEmails,
  normaliseEmail,
} from '@/domain/memberProfile'
import type { EmergencyContact, UserProfile } from '@/types/member'

// Same Firestore collection mobile/ reads and writes — the schema is shared
// across both apps, so field shapes here (e.g. JSON-stringified nested
// objects) must stay wire-compatible with mobile@1cdfada/services/firestore.ts.
const USERS = 'users'

/**
 * The indexed lookup: exact equality on the stored address.
 *
 * Cheap — one document read — and answers most sign-ins. It is only ever a
 * *fast path*, though, never a verdict: it matches only a record whose stored
 * address is already lower case, which is a property of whatever wrote it
 * rather than anything this app can assume. A miss means "ask properly", which
 * is what `findOrLinkProfile` does next.
 */
async function queryProfileByEmailExact(email: string): Promise<UserProfile | null> {
  const target = normaliseEmail(email)
  if (!target) return null
  const snap = await getDocs(query(collection(db, USERS), where('email', '==', target), fsLimit(1)))
  if (snap.empty) return null
  const docSnap = snap.docs[0]
  return { uid: docSnap.id, ...(docSnap.data() as Omit<UserProfile, 'uid'>) }
}

/**
 * Moves a record the gym already holds onto the real Firebase uid, keeping
 * everything on it.
 *
 * This is the one write that must never lose anything. What the member brings
 * from Google is an identity — an address, a display name, a photo — and that
 * is the whole of what it may overwrite. The pass, the punches, the dates, the
 * waivers, `memberSince`, the sign-in history: none of it has any business
 * being touched by somebody signing in, and a blank membership written over a
 * paid one is not a cosmetic bug.
 *
 * `keepRoles` is false for anything matched on a name. The rules will reject
 * such a write anyway if it arrives carrying a flag, so this is not merely
 * policy — it is what makes the write legal. An imported supervisor found by
 * name comes across as an ordinary member and has to be re-granted.
 *
 * The address the record was filed under is kept in `additionalEmails` rather
 * than dropped. It is how the member appears on older receipts and in whatever
 * sheet the record came from, and it is the evidence for why this link happened
 * at all.
 */
async function linkRecordToUid(
  uid: string,
  record: UserProfile,
  google: { name: string; email: string; photo: string | null },
  keepRoles: boolean,
  extra: Partial<Omit<UserProfile, 'uid'>> = {},
): Promise<UserProfile> {
  const { uid: oldUid, ...stored } = record
  const now = new Date().toISOString()
  const additional = mergeAdditionalEmails(stored.additionalEmails, stored.email, google.email)

  const linked: Omit<UserProfile, 'uid'> = {
    ...stored,
    name: google.name,
    email: google.email,
    photo: google.photo,
    ...(keepRoles ? {} : { isAdmin: false, isSupervisor: false }),
    ...(additional.length > 0 ? { additionalEmails: JSON.stringify(additional) } : {}),
    ...extra,
    linkedFrom: oldUid,
    lastUpdatedBy: google.email,
    lastUpdatedAt: now,
  }

  await setDoc(doc(db, USERS, uid), linked)
  // The old document is now a duplicate of the one just written. Non-fatal:
  // the member holds their record either way, and an orphan is an admin
  // tidying job rather than a failed sign-in.
  try {
    await deleteProfile(oldUid)
  } catch (e) {
    console.warn('[Profile] Failed to delete superseded profile doc:', oldUid, e)
  }
  return { uid, ...linked }
}

/**
 * The member's profile, joining them to a record the gym already holds if this
 * is the first time they have signed in with this Google account.
 *
 * Three questions, in descending order of how much they prove:
 *
 * 1. Is there a document at this Firebase uid? Then it is theirs, full stop.
 * 2. Does any record carry this email address? Strong: the account proves it,
 *    and `firestore.rules` re-checks it, which is why a record matched this way
 *    may keep an isAdmin or isSupervisor an admin had already granted.
 * 3. Does any record carry this legal name, and only one? Weak, and it is here
 *    because email alone left real members stranded — a record filed under an
 *    address they no longer use is invisible to step 2, and the app's answer
 *    was to greet them as a stranger. Google's account name is a real full name
 *    often enough to be worth trying; when it is not, the setup form asks for
 *    the legal name directly and tries again with that.
 *
 * Returns null only when all three genuinely find nothing — never because a
 * lookup failed. See the rethrow below.
 */
export async function findOrLinkProfile(
  uid: string,
  name: string,
  email: string,
  photo: string | null,
): Promise<UserProfile | null> {
  const docSnap = await getDoc(doc(db, USERS, uid))
  if (docSnap.exists()) {
    return { uid, ...(docSnap.data() as Omit<UserProfile, 'uid'>) }
  }

  // A failed lookup used to be swallowed here and carried on with "no record
  // found". But null does not mean "no record" — it means "did not find one",
  // and the caller cannot tell those apart: a member the gym has held for years
  // gets the new-member form and registers a second time over the top. It is
  // raised instead, so ProfileContext can say so and offer Try Again. A
  // genuinely new member loses nothing by retrying.
  const match = await findRecordFor(uid, email, name).catch((e: unknown) => {
    throw new Error(
      `Could not check whether KBC already holds a record for ${email}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    )
  })
  if (!match) {
    // Nobody by this address or this name. The setup form asks for the legal
    // name directly and tries once more with that, Google's account name being
    // a nickname often enough to be worth a second attempt.
    return null
  }

  const byEmail = normaliseEmail(match.email) === normaliseEmail(email)
  console.log('[Profile] Linking', uid, 'to record', match.uid, byEmail ? 'by email' : 'by name')
  // Roles cross only on an email match, which firestore.rules re-checks against
  // the linkedFrom record for itself. A name proves nothing, so a name match
  // arrives as an ordinary member whatever the record said.
  return linkRecordToUid(uid, match, { name, email, photo }, byEmail)
}

/**
 * The record the gym holds for this person, by address or by name.
 *
 * The indexed query first, because it settles the common case in a single read.
 * Everything else needs the collection — a stored address that is not lower
 * case, or a match on the account name — so it is read once and both questions
 * are asked of it, rather than paying for it twice.
 */
async function findRecordFor(
  uid: string,
  email: string,
  googleName: string,
): Promise<UserProfile | null> {
  const fast = await queryProfileByEmailExact(email)
  if (fast) return fast
  return findExistingRecord(await getAllProfiles(), email, [googleName], uid)
}

/**
 * Creates a full member profile during self-registration (new member setup screen).
 * Called once after the user completes the onboarding form.
 */
export async function createSelfRegisteredProfile(
  uid: string,
  name: string,
  email: string,
  photo: string | null,
  legalName: string,
  emergencyContact: EmergencyContact,
  preferredName?: string,
  phone?: string,
): Promise<UserProfile> {
  const now = new Date().toISOString()
  const fresh: Omit<UserProfile, 'uid'> = {
    name,
    legalName,
    email,
    photo,
    membershipAccessPass: 'none',
    membershipConfirmed: true,
    isAdmin: false,
    isSupervisor: false,
    punchPassRemaining: 0,
    memberSince: now,
    membershipStart: null,
    membershipExpiry: null,
    emergencyContact: JSON.stringify(emergencyContact),
    // They typed every word of this document a second ago, so it is reviewed by
    // definition — and marking it keeps OnboardingGate from sending them back.
    profileReviewedAt: now,
    ...(preferredName ? { preferredName } : {}),
    ...(phone ? { phone } : {}),
  }
  await setDoc(doc(db, USERS, uid), fresh)
  return { uid, ...fresh }
}

/**
 * Saving the setup form for someone the app believes has no record.
 *
 * It asks once more before believing it. `findOrLinkProfile` has already tried
 * this member's email and their Google account name; what is new here is the
 * legal name they have just typed, which is the name the gym's own records are
 * kept under and frequently not the one Google reports. This is the last point
 * at which a member of years' standing can still be recognised, and the cost of
 * missing them is the whole reason this function exists: they register a second
 * time, and the record holding their pass is left orphaned behind them.
 *
 * A match keeps everything on the stored record — see `linkRecordToUid`. The
 * fields the member filled in here are applied on top, because those they have
 * just affirmed; nothing else is touched. Only when all of it genuinely finds
 * nobody is a fresh profile created.
 */
export async function registerOrClaimProfile(
  uid: string,
  name: string,
  email: string,
  photo: string | null,
  legalName: string,
  emergencyContact: EmergencyContact,
  preferredName?: string,
  phone?: string,
): Promise<UserProfile> {
  // Believing the member has no record is not the same as checking. This is
  // the only path that setDocs a whole profile, so if something upstream was
  // wrong about that — a lookup that threw and was read as "not found", a
  // stale render — this is where a live membership would be replaced by a
  // blank one. One read is a cheap price for that not being possible.
  const alreadyThere = await getDoc(doc(db, USERS, uid))
  if (alreadyThere.exists()) {
    console.warn('[Profile] Asked to register a uid that already has a profile — updating instead')
    await completeMemberProfile(
      uid,
      { name, photo, legalName, emergencyContact, preferredName, phone },
      email,
    )
    return (await getProfileByUid(uid)) as UserProfile
  }

  const typed: Partial<Omit<UserProfile, 'uid'>> = {
    legalName,
    emergencyContact: JSON.stringify(emergencyContact),
    profileReviewedAt: new Date().toISOString(),
    ...(preferredName ? { preferredName } : {}),
    ...(phone ? { phone } : {}),
  }

  let match: UserProfile | null = null
  try {
    match = findExistingRecord(await getAllProfiles(), email, [legalName, name], uid)
  } catch (e) {
    // Unlike the lookup in findOrLinkProfile, this one does not raise. The
    // member is standing in front of a completed form, and refusing to save it
    // costs them their sign-up; the worst case here is the duplicate record an
    // admin can merge, which is what used to happen every time regardless.
    console.warn('[Profile] Could not check for an existing record before registering:', e)
  }

  if (match) {
    console.log('[Profile] Registering', uid, 'onto the existing record', match.uid)
    // Roles are kept only when the match was the email, which the rules can
    // verify for themselves; a name match must arrive without them.
    const byEmail = normaliseEmail(match.email) === normaliseEmail(email)
    return linkRecordToUid(uid, match, { name, email, photo }, byEmail, typed)
  }

  return createSelfRegisteredProfile(
    uid,
    name,
    email,
    photo,
    legalName,
    emergencyContact,
    preferredName,
    phone,
  )
}

/**
 * Fill in the gaps on a profile that already exists.
 *
 * The setup form is no longer only for brand-new members: someone imported from
 * a CSV, or added by a supervisor, arrives with a record already written and
 * possibly a membership, punch passes or a supervisor flag on it. Running
 * `createSelfRegisteredProfile` for them would `setDoc` a fresh document over
 * the top, resetting `membershipAccessPass` to none, punches to zero, both role
 * flags to false and `memberSince` to today — quietly cancelling whatever they
 * had paid for. This writes only the fields the member just supplied.
 *
 * `name`/`photo` come from Google and are refreshed here too, since an imported
 * record has whatever the spreadsheet said rather than their account's own.
 *
 * It also runs when nothing was missing at all — a complete imported record is
 * still shown to its owner once for confirmation, and `profileReviewedAt` is
 * what records that they gave it.
 */
export async function completeMemberProfile(
  uid: string,
  updates: {
    name: string
    photo: string | null
    legalName: string
    emergencyContact: EmergencyContact
    preferredName?: string
    phone?: string
  },
  updatedByEmail: string,
): Promise<void> {
  await updateProfile(
    uid,
    {
      name: updates.name,
      photo: updates.photo,
      legalName: updates.legalName,
      emergencyContact: JSON.stringify(updates.emergencyContact),
      profileReviewedAt: new Date().toISOString(),
      ...(updates.preferredName ? { preferredName: updates.preferredName } : {}),
      ...(updates.phone ? { phone: updates.phone } : {}),
    },
    updatedByEmail,
  )
}

export async function getAllProfiles(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, USERS))
  return (
    snap.docs
      .map((docSnap) => ({ uid: docSnap.id, ...(docSnap.data() as Omit<UserProfile, 'uid'>) }))
      // `name` is absent on a record written by hand rather than by this app or
      // admin-web/, and localeCompare on undefined throws. That used to cost one
      // row on the members screen; this list now also decides whether a member
      // is joined to their pre-registered record at all, and one malformed
      // document must not be able to fail that for everybody.
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  )
}

export async function updateProfile(
  uid: string,
  updates: Partial<Omit<UserProfile, 'uid' | 'memberSince'>>,
  updatedByEmail: string,
): Promise<void> {
  await updateDoc(doc(db, USERS, uid), {
    ...updates,
    lastUpdatedBy: updatedByEmail,
    lastUpdatedAt: new Date().toISOString(),
  })
}

export async function getProfileByUid(uid: string): Promise<UserProfile | null> {
  const docSnap = await getDoc(doc(db, USERS, uid))
  if (!docSnap.exists()) return null
  return { uid, ...(docSnap.data() as Omit<UserProfile, 'uid'>) }
}

/**
 * Manually create a new member profile (used by supervisors for walk-in / new members).
 * Generates a synthetic uid — the member can link a Google account later.
 */
export async function createNewMemberProfile(
  legalName: string,
  email: string,
  emergencyContact: EmergencyContact,
  createdByEmail: string,
): Promise<UserProfile> {
  const uid = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const now = new Date().toISOString()
  const fresh: Omit<UserProfile, 'uid'> = {
    name: legalName,
    legalName,
    email: email.toLowerCase().trim(),
    photo: null,
    membershipAccessPass: 'none',
    membershipConfirmed: true,
    isAdmin: false,
    isSupervisor: false,
    punchPassRemaining: 0,
    memberSince: now,
    membershipStart: null,
    membershipExpiry: null,
    emergencyContact: JSON.stringify(emergencyContact),
    lastUpdatedBy: createdByEmail,
    lastUpdatedAt: now,
  }
  await setDoc(doc(db, USERS, uid), fresh)
  return { uid, ...fresh }
}

export async function deleteProfile(uid: string): Promise<void> {
  await deleteDoc(doc(db, USERS, uid))
}

/**
 * Checks a user's membership dates and clears a lapsed pass if needed.
 * Call on sign-in, profile screen load, and after admin membership updates.
 * Returns the updated profile, or null if no change was needed.
 */
export async function checkAndClearLapsedPass(
  profile: UserProfile,
  updatedByEmail = 'system',
): Promise<UserProfile | null> {
  const pass = nextAccessPass(profile)
  if (pass === null) return null

  const updates = { membershipAccessPass: pass }
  await updateProfile(profile.uid, updates, updatedByEmail)
  return { ...profile, ...updates }
}
