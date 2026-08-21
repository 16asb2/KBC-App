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
import { nextMembershipStatus } from '@/domain/membership'
import type { EmergencyContact, UserProfile } from '@/types/member'

// Same Firestore collection mobile/ reads and writes — the schema is shared
// across both apps, so field shapes here (e.g. JSON-stringified nested
// objects) must stay wire-compatible with mobile/services/firestore.ts.
const USERS = 'users'

async function findProfileByEmail(email: string): Promise<UserProfile | null> {
  const snap = await getDocs(
    query(collection(db, USERS), where('email', '==', email.toLowerCase().trim()), fsLimit(1)),
  )
  if (snap.empty) return null
  const docSnap = snap.docs[0]
  return { uid: docSnap.id, ...(docSnap.data() as Omit<UserProfile, 'uid'>) }
}

/**
 * Looks up an existing member profile by Firebase UID, or links an email-matched
 * manually-created profile to the Firebase UID on first Google sign-in.
 * Returns null for brand-new users who have never completed setup.
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

  // Check for an existing profile by email (manually created before first Google sign-in)
  let existing: UserProfile | null = null
  try {
    existing = await findProfileByEmail(email)
  } catch (e) {
    console.warn('[Profile] Email lookup failed:', e)
  }

  if (existing) {
    console.log('[Profile] Linking Firebase UID to existing member profile for', email)
    const { uid: _discarded, ...existingData } = existing
    const linked: Omit<UserProfile, 'uid'> = { ...existingData, name, email, photo }
    await setDoc(doc(db, USERS, uid), linked)
    return { uid, ...linked }
  }

  // Brand-new user — profile is created when they complete the setup form
  return null
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
    membershipStatus: 'inactive',
    isAdmin: false,
    isSupervisor: false,
    punchPassRemaining: 0,
    memberSince: now,
    membershipStart: null,
    membershipExpiry: null,
    emergencyContact: JSON.stringify(emergencyContact),
    ...(preferredName ? { preferredName } : {}),
    ...(phone ? { phone } : {}),
  }
  await setDoc(doc(db, USERS, uid), fresh)
  return { uid, ...fresh }
}

export async function getAllProfiles(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, USERS))
  return snap.docs
    .map((docSnap) => ({ uid: docSnap.id, ...(docSnap.data() as Omit<UserProfile, 'uid'>) }))
    .sort((a, b) => a.name.localeCompare(b.name))
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
    membershipStatus: 'inactive',
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
 * Checks a user's membership fields and auto-transitions status if needed.
 * Call on sign-in, profile screen load, and after admin membership updates.
 * Returns the updated profile, or null if no change was needed.
 */
export async function checkAndUpdateMembershipStatus(
  profile: UserProfile,
  updatedByEmail = 'system',
): Promise<UserProfile | null> {
  const status = nextMembershipStatus(profile)
  if (status === null) return null

  const updates = { membershipStatus: status }
  await updateProfile(profile.uid, updates, updatedByEmail)
  return { ...profile, ...updates }
}
