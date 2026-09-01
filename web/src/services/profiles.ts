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
  findRecordsByLegalName,
  findProfileByEmailIn,
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
  const match = await findRecordByEmail(email).catch((e: unknown) => {
    throw new Error(
      `Could not check whether KBC already holds a record for ${email}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    )
  })
  if (!match) {
    // No record under this address. That is not the same as no record: the gym
    // files members under their legal name, and the address on file is often
    // one they stopped using years ago. The setup form asks for the name and
    // settles it there — see findRecordsForLegalName. Guessing here, silently,
    // on whatever Google reports as the account name, is what this used to do,
    // and it is not a decision to make on somebody's behalf.
    return null
  }

  console.log('[Profile] Linking', uid, 'to record', match.uid, 'by email')
  // Roles cross on an email match because firestore.rules can re-check it
  // against the linkedFrom record for itself.
  return linkRecordToUid(uid, match, { name, email, photo }, true)
}

/**
 * The record filed under an address, if there is one.
 *
 * The indexed query first, because it settles the common case in a single read.
 * A miss is not an answer, though — it matches only a record whose stored
 * address is already lower case — so the collection is read and compared
 * properly before concluding there is nothing.
 */
async function findRecordByEmail(email: string): Promise<UserProfile | null> {
  const fast = await queryProfileByEmailExact(email)
  if (fast) return fast
  return findProfileByEmailIn(await getAllProfiles(), email)
}

/**
 * Every record filed under a legal name, for the setup form to offer.
 *
 * This is the lookup that actually finds returning members, and it deliberately
 * does not decide anything: it hands back what it found, masked, and the person
 * signing in says which is them. They are the only one who knows, and a wrong
 * guess hands somebody else's membership over.
 */
export async function findRecordsForLegalName(
  uid: string,
  legalName: string,
): Promise<UserProfile[]> {
  return findRecordsByLegalName(await getAllProfiles(), legalName, uid)
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
  preferredEmail?: string,
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
    ...(preferredEmail ? { preferredEmail } : {}),
  }
  await setDoc(doc(db, USERS, uid), fresh)
  return { uid, ...fresh }
}

/**
 * Saving the setup form.
 *
 * `chosen` is the record the member picked out of the ones filed under their
 * legal name, or null if they said none of them were theirs. Either way this is
 * the only place a first-time profile is written, and the difference between
 * the two is the difference between keeping a membership and losing one.
 *
 * A chosen record keeps everything on it (see `linkRecordToUid`) with the
 * form's answers applied on top. The address the gym had on file becomes
 * `preferredEmail` — a member who signs in with a Google account but is reached
 * at another address is the ordinary case here, not an anomaly, and dropping
 * the old address would mean the gym could no longer contact the person it just
 * recognised.
 */
export async function saveSetupProfile(
  uid: string,
  google: { name: string; email: string; photo: string | null },
  form: {
    legalName: string
    emergencyContact: EmergencyContact
    preferredName?: string
    phone?: string
    preferredEmail?: string
  },
  chosen: UserProfile | null,
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
      {
        name: google.name,
        photo: google.photo,
        legalName: form.legalName,
        emergencyContact: form.emergencyContact,
        preferredName: form.preferredName,
        phone: form.phone,
        preferredEmail: form.preferredEmail,
      },
      google.email,
    )
    return (await getProfileByUid(uid)) as UserProfile
  }

  if (!chosen) {
    return createSelfRegisteredProfile(
      uid,
      google.name,
      google.email,
      google.photo,
      form.legalName,
      form.emergencyContact,
      form.preferredName,
      form.phone,
      form.preferredEmail,
    )
  }

  console.log('[Profile] Joining', uid, 'to the record the member identified:', chosen.uid)
  const onFile = normaliseEmail(chosen.email)
  const preferred = form.preferredEmail?.trim() ||
    chosen.preferredEmail ||
    (onFile && onFile !== normaliseEmail(google.email) ? chosen.email : undefined)

  const typed: Partial<Omit<UserProfile, 'uid'>> = {
    legalName: form.legalName,
    emergencyContact: JSON.stringify(form.emergencyContact),
    profileReviewedAt: new Date().toISOString(),
    ...(form.preferredName ? { preferredName: form.preferredName } : {}),
    ...(form.phone ? { phone: form.phone } : {}),
    ...(preferred ? { preferredEmail: preferred } : {}),
  }

  // Roles never cross here. The member has proved they can type a legal name,
  // which is public knowledge around a gym; firestore.rules refuses this write
  // outright if it arrives carrying either flag, so this is what makes it legal
  // rather than merely what makes it prudent.
  return linkRecordToUid(uid, chosen, google, false, typed)
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
    preferredEmail?: string
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
      ...(updates.preferredEmail ? { preferredEmail: updates.preferredEmail } : {}),
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
