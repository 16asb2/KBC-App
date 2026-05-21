// Firestore via REST API — avoids Firebase SDK incompatibility with New Architecture
import { fetchWithAuth } from '@/services/authBridge';

const PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!;
const API_KEY    = process.env.EXPO_PUBLIC_FIREBASE_API_KEY!;
const BASE       = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const QUERY_URL  = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;

// 'inactive' = registered but no current access (new sign-ups, lapsed memberships)
// 'pending'  = purchased access, awaiting admin confirmation
// 'active'   = has a valid current membership
export type MembershipStatus = 'active' | 'pending' | 'inactive';

export type WaiverRecord = {
  signedAt: string;    // ISO timestamp
  signedBy: string;    // full legal name
  guardian?: string;   // guardian name if signed on behalf of a minor
  docUrl?: string;     // Google Docs webViewLink (created after signing)
};

export type EmergencyContact = {
  name: string;
  relationship: string;
  phone: string;
};

export type UserProfile = {
  uid: string;
  name: string;            // Google account name (locked)
  legalName?: string;      // legal name — admin-only editable; auto-set for manually created members
  email: string;           // Google account email (locked)
  photo: string | null;
  membershipStatus: MembershipStatus;
  isAdmin: boolean;        // dynamically managed via Firestore — except SUPER_ADMIN_EMAIL which is hardcoded
  isSupervisor: boolean;
  punchPassRemaining: number;
  memberSince: string;             // first registration date (ISO)
  membershipStart: string | null;  // start of current paid period (ISO)
  membershipExpiry: string | null; // end of current paid period (ISO)
  // Waiver — stored as JSON string in Firestore (signed during member creation)
  waiverLiability?: string;        // JSON WaiverRecord
  // User-editable profile fields
  preferredName?: string;          // display name override
  additionalEmails?: string;       // JSON string[]
  preferredEmail?: string;         // selected contact email
  phone?: string;                  // international format
  emergencyContact?: string;       // JSON EmergencyContact
  additionalComments?: string;     // free text for KBC staff
  pendingPunches?: number | null;      // total punch passes in purchase awaiting admin confirmation
  pendingMembership?: string | null;   // JSON { label, price, start, expiry } awaiting admin confirmation
  lastSignInAt?: string;           // ISO — last completed session sign-in (enforces 24h rule)
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
};

// ─── Firestore value encoding / decoding ────────────────────────────────────

type FVal = Record<string, any>;

function encode(val: any): FVal {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') return { integerValue: String(val) };
  if (typeof val === 'string') return { stringValue: val };
  return { nullValue: null };
}

function decode(fval: FVal): any {
  if ('stringValue'   in fval) return fval.stringValue;
  if ('booleanValue'  in fval) return fval.booleanValue;
  if ('integerValue'  in fval) return parseInt(fval.integerValue, 10);
  if ('timestampValue'in fval) return fval.timestampValue;
  return null;
}

function encodeDoc(data: Record<string, any>) {
  const fields: Record<string, FVal> = {};
  for (const [k, v] of Object.entries(data)) fields[k] = encode(v);
  return { fields };
}

function decodeDoc(doc: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(doc.fields ?? {})) out[k] = decode(v as FVal);
  return out;
}

// ─── Low-level helpers ───────────────────────────────────────────────────────

async function fsGet(path: string) {
  const res = await fetchWithAuth(`${BASE}/${path}?key=${API_KEY}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET ${res.status}`);
  return res.json();
}

async function fsPatch(path: string, data: Record<string, any>, mask?: string[]) {
  let url = `${BASE}/${path}?key=${API_KEY}`;
  if (mask) url += mask.map(f => `&updateMask.fieldPaths=${encodeURIComponent(f)}`).join('');
  const res = await fetchWithAuth(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encodeDoc(data)),
  });
  if (!res.ok) throw new Error(`Firestore PATCH ${res.status}`);
  return res.json();
}

async function fsList(col: string): Promise<any[]> {
  const res = await fetchWithAuth(`${BASE}/${col}?key=${API_KEY}&pageSize=300`);
  if (!res.ok) throw new Error(`Firestore LIST ${res.status}`);
  const json = await res.json();
  return json.documents ?? [];
}

async function fsQuery(query: any): Promise<any[]> {
  const res = await fetchWithAuth(QUERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: query }),
  });
  if (!res.ok) throw new Error(`Firestore QUERY ${res.status}`);
  const rows: any[] = await res.json();
  return rows.filter((r: any) => r.document).map((r: any) => r.document);
}

async function findProfileByEmail(email: string): Promise<UserProfile | null> {
  const docs = await fsQuery({
    from: [{ collectionId: 'users' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'email' },
        op: 'EQUAL',
        value: { stringValue: email.toLowerCase().trim() },
      },
    },
    limit: 1,
  });
  if (!docs.length) return null;
  const doc = docs[0];
  const docUid = doc.name.split('/').pop() as string;
  return { uid: docUid, ...decodeDoc(doc) } as UserProfile;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getOrCreateProfile(
  uid: string,
  name: string,
  email: string,
  photo: string | null,
): Promise<UserProfile> {
  const doc = await fsGet(`users/${uid}`);
  if (doc) return { uid, ...decodeDoc(doc) } as UserProfile;

  // Check for an existing profile by email (e.g., manually created before first Google sign-in)
  let existing: UserProfile | null = null;
  try {
    existing = await findProfileByEmail(email);
  } catch (e) {
    console.warn('[Profile] Email lookup failed, creating fresh profile:', e);
  }

  if (existing) {
    console.log('[Profile] Linking Firebase UID to existing member profile for', email);
    const { uid: _discarded, ...existingData } = existing;
    const linked: Omit<UserProfile, 'uid'> = { ...existingData, name, email, photo };
    await fsPatch(`users/${uid}`, linked);
    return { uid, ...linked };
  }

  // Brand-new user — create as inactive member pending admin review
  const fresh: Omit<UserProfile, 'uid'> = {
    name,
    email,
    photo,
    membershipStatus: 'inactive',
    isAdmin: false,
    isSupervisor: false,
    punchPassRemaining: 0,
    memberSince: new Date().toISOString(),
    membershipStart: null,
    membershipExpiry: null,
  };
  await fsPatch(`users/${uid}`, fresh);
  return { uid, ...fresh };
}

export async function getAllProfiles(): Promise<UserProfile[]> {
  const docs = await fsList('users');
  return docs
    .map(doc => {
      const uid = doc.name.split('/').pop() as string;
      return { uid, ...decodeDoc(doc) } as UserProfile;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateProfile(
  uid: string,
  updates: Partial<Omit<UserProfile, 'uid' | 'memberSince'>>,
  updatedByEmail: string,
): Promise<void> {
  const data = {
    ...updates,
    lastUpdatedBy: updatedByEmail,
    lastUpdatedAt: new Date().toISOString(),
  };
  await fsPatch(`users/${uid}`, data, Object.keys(data));
}

export async function getProfileByUid(uid: string): Promise<UserProfile | null> {
  const doc = await fsGet(`users/${uid}`);
  if (!doc) return null;
  return { uid, ...decodeDoc(doc) } as UserProfile;
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
  const uid = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
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
  };
  await fsPatch(`users/${uid}`, fresh);
  return { uid, ...fresh };
}

export async function deleteProfile(uid: string): Promise<void> {
  const res = await fetchWithAuth(`${BASE}/users/${uid}?key=${API_KEY}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Firestore DELETE ${res.status}`);
}

// ─── Auto-transition: membership status ─────────────────────────────────────

/**
 * Checks a user's membership fields and auto-transitions status if needed.
 * Call on sign-in, profile screen load, and after admin membership updates.
 * Returns updated profile (or null if no change was needed).
 *
 * Rules:
 *  - If membershipExpiry is non-null and in the past → set 'inactive'
 *  - Punch-pass-only users are NOT promoted to 'active' — punch passes grant
 *    per-visit access only; membershipStatus stays 'inactive'
 */
export async function checkAndUpdateMembershipStatus(
  profile: UserProfile,
  updatedByEmail = 'system',
): Promise<UserProfile | null> {
  const now = new Date();

  // Expired membership → inactive
  if (
    profile.membershipExpiry &&
    new Date(profile.membershipExpiry) < now &&
    (profile.membershipStatus === 'active' || profile.membershipStatus === 'pending')
  ) {
    const updates = { membershipStatus: 'inactive' as MembershipStatus };
    await updateProfile(profile.uid, updates, updatedByEmail);
    return { ...profile, ...updates };
  }

  return null; // no change needed
}

// ─── One-time migration (call manually from a dev screen or console) ─────────

/**
 * Backfills isAdmin, membershipStatus, and membershipExpiry for any existing
 * user documents that are missing these fields.
 * Safe to call multiple times — only writes fields that are undefined/null.
 * Does NOT overwrite existing values.
 */
export async function migrateExistingUsers(): Promise<{ updated: number; skipped: number }> {
  const docs = await fsList('users');
  let updated = 0;
  let skipped = 0;

  for (const doc of docs) {
    const uid    = doc.name.split('/').pop() as string;
    const data   = decodeDoc(doc);
    const fields: Record<string, any> = {};

    if (data.isAdmin === undefined || data.isAdmin === null) {
      fields.isAdmin = false;
    }
    if (data.membershipStatus === undefined || data.membershipStatus === null) {
      fields.membershipStatus = 'active'; // assume existing users were members
    }
    if (data.membershipExpiry === undefined) {
      fields.membershipExpiry = null;
    }

    if (Object.keys(fields).length > 0) {
      await fsPatch(`users/${uid}`, fields, Object.keys(fields));
      updated++;
    } else {
      skipped++;
    }
  }

  return { updated, skipped };
}
