/**
 * Security-rules tests for the users/{uid} collection in ../firestore.rules.
 *
 *   npm run test:emulated          (needs Java — the Firestore emulator is a JVM app)
 *
 * These exist mainly to hold one claim honest: that a member an admin
 * pre-registered as a supervisor can complete their first Google sign-in.
 * findOrLinkProfile() copies their profile to the real Firebase uid carrying
 * isAdmin/isSupervisor, which both original create branches rejected — see
 * commit 505d58c. The linkedFrom branch that fixes it is also the only place
 * the rules let a create keep those flags, so the attacks it could have opened
 * are covered here too.
 *
 * The delete branch below is the other half of that link: the copy leaves the
 * original record behind, and until claimsThisRecord() existed an ordinary
 * member could not remove it, so the directory showed them twice. Deleting
 * somebody's record is the most destructive thing these rules permit a member
 * to do, so the ways it must *not* work are covered at length.
 */

import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore'

const rulesPath = fileURLToPath(new URL('../firestore.rules', import.meta.url))

const testEnv = await initializeTestEnvironment({
  projectId: 'kbc-app-3307b',
  firestore: {
    rules: readFileSync(rulesPath, 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
})

/** A member profile shaped the way createNewMemberProfile() writes one. */
function profile(overrides = {}) {
  return {
    name: 'Test Member',
    legalName: 'Test Member',
    email: 'member@example.com',
    photo: null,
    membershipAccessPass: 'none',
    membershipConfirmed: true,
    isAdmin: false,
    isSupervisor: false,
    punchPassRemaining: 0,
    memberSince: '2026-01-01T00:00:00.000Z',
    membershipStart: null,
    membershipExpiry: null,
    emergencyContact: JSON.stringify({ name: 'Kin', relationship: 'Partner', phone: '+16135550123' }),
    ...overrides,
  }
}

/** Seed a document bypassing rules, the way an admin would have created it. */
async function seed(id, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', id), data)
  })
}

function asUser(uid, email) {
  return testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore()
}

test.beforeEach(async () => {
  await testEnv.clearFirestore()
})

test.after(async () => {
  await testEnv.cleanup()
})

// ─── create: ordinary self-registration ──────────────────────────────────────

test('a brand-new member can self-register', async () => {
  const db = asUser('uid-new', 'new@example.com')
  await assertSucceeds(setDoc(doc(db, 'users', 'uid-new'), profile({ email: 'new@example.com' })))
})

test('self-registration cannot claim isAdmin', async () => {
  const db = asUser('uid-new', 'new@example.com')
  await assertFails(
    setDoc(doc(db, 'users', 'uid-new'), profile({ email: 'new@example.com', isAdmin: true })),
  )
})

test('self-registration cannot claim isSupervisor', async () => {
  const db = asUser('uid-new', 'new@example.com')
  await assertFails(
    setDoc(doc(db, 'users', 'uid-new'), profile({ email: 'new@example.com', isSupervisor: true })),
  )
})

test('a member cannot create a profile under another uid', async () => {
  const db = asUser('uid-attacker', 'attacker@example.com')
  await assertFails(
    setDoc(doc(db, 'users', 'uid-victim'), profile({ email: 'attacker@example.com' })),
  )
})

// ─── create: linking a pre-registered profile (the 505d58c fix) ───────────────

test('a pre-registered SUPERVISOR can link on first sign-in', async () => {
  await seed('manual_1', profile({ email: 'super@example.com', isSupervisor: true }))
  const db = asUser('uid-super', 'super@example.com')
  await assertSucceeds(
    setDoc(
      doc(db, 'users', 'uid-super'),
      profile({ email: 'super@example.com', isSupervisor: true, linkedFrom: 'manual_1' }),
    ),
  )
})

test('a pre-registered ADMIN can link on first sign-in', async () => {
  await seed('manual_2', profile({ email: 'admin@example.com', isAdmin: true }))
  const db = asUser('uid-admin', 'admin@example.com')
  await assertSucceeds(
    setDoc(
      doc(db, 'users', 'uid-admin'),
      profile({ email: 'admin@example.com', isAdmin: true, linkedFrom: 'manual_2' }),
    ),
  )
})

test('a pre-registered ordinary member still links fine', async () => {
  await seed('manual_3', profile({ email: 'plain@example.com' }))
  const db = asUser('uid-plain', 'plain@example.com')
  await assertSucceeds(
    setDoc(
      doc(db, 'users', 'uid-plain'),
      profile({ email: 'plain@example.com', linkedFrom: 'manual_3' }),
    ),
  )
})

// ─── create: the ways linkedFrom must not be abusable ────────────────────────

test('linkedFrom cannot point at a profile with a different email', async () => {
  await seed('admin_doc', profile({ email: 'realadmin@example.com', isAdmin: true }))
  const db = asUser('uid-attacker', 'attacker@example.com')
  await assertFails(
    setDoc(
      doc(db, 'users', 'uid-attacker'),
      profile({ email: 'attacker@example.com', isAdmin: true, linkedFrom: 'admin_doc' }),
    ),
  )
})

test('linkedFrom cannot claim flags the source does not have', async () => {
  await seed('manual_4', profile({ email: 'climber@example.com' })) // both flags false
  const db = asUser('uid-climber', 'climber@example.com')
  await assertFails(
    setDoc(
      doc(db, 'users', 'uid-climber'),
      profile({ email: 'climber@example.com', isAdmin: true, linkedFrom: 'manual_4' }),
    ),
  )
})

test('linkedFrom cannot escalate supervisor into admin', async () => {
  await seed('manual_5', profile({ email: 'super2@example.com', isSupervisor: true }))
  const db = asUser('uid-super2', 'super2@example.com')
  await assertFails(
    setDoc(
      doc(db, 'users', 'uid-super2'),
      profile({
        email: 'super2@example.com',
        isSupervisor: true,
        isAdmin: true,
        linkedFrom: 'manual_5',
      }),
    ),
  )
})

test('linkedFrom pointing at a nonexistent doc is rejected', async () => {
  const db = asUser('uid-ghost', 'ghost@example.com')
  await assertFails(
    setDoc(
      doc(db, 'users', 'uid-ghost'),
      profile({ email: 'ghost@example.com', isAdmin: true, linkedFrom: 'does_not_exist' }),
    ),
  )
})

test('linkedFrom pointing at itself is rejected', async () => {
  const db = asUser('uid-self', 'self@example.com')
  await assertFails(
    setDoc(
      doc(db, 'users', 'uid-self'),
      profile({ email: 'self@example.com', isAdmin: true, linkedFrom: 'uid-self' }),
    ),
  )
})

// ─── update: privilege escalation on an existing profile ─────────────────────

test('a member cannot grant themselves isAdmin', async () => {
  await seed('uid-m', profile({ email: 'm@example.com' }))
  const db = asUser('uid-m', 'm@example.com')
  await assertFails(updateDoc(doc(db, 'users', 'uid-m'), { isAdmin: true }))
})

test('a member cannot grant themselves isSupervisor', async () => {
  await seed('uid-m', profile({ email: 'm@example.com' }))
  const db = asUser('uid-m', 'm@example.com')
  await assertFails(updateDoc(doc(db, 'users', 'uid-m'), { isSupervisor: true }))
})

test('a member cannot confirm their own purchase', async () => {
  // Seeded mid-purchase: they have recorded an annual pass and an admin has
  // yet to confirm the payment. Seeding the default profile instead made this
  // a write of true over true — an empty diff, which no rule can deny.
  await seed(
    'uid-m',
    profile({ email: 'm@example.com', membershipAccessPass: 'annual', membershipConfirmed: false }),
  )
  const db = asUser('uid-m', 'm@example.com')
  await assertFails(updateDoc(doc(db, 'users', 'uid-m'), { membershipConfirmed: true }))
})

test('a member cannot give themselves a pass and confirm it in one write', async () => {
  await seed('uid-m', profile({ email: 'm@example.com' }))
  const db = asUser('uid-m', 'm@example.com')
  await assertFails(
    updateDoc(doc(db, 'users', 'uid-m'), {
      membershipAccessPass: 'annual',
      membershipConfirmed: true,
    }),
  )
})

/**
 * The escalation the two tests above did not reach: membershipConfirmed rests
 * at true for a member holding no pass, so granting yourself a pass and simply
 * not mentioning the confirmation left a diff containing nothing the rules were
 * checking, and the record read back as a confirmed annual membership.
 */
test('a member cannot grant themselves a pass by leaving membershipConfirmed alone', async () => {
  await seed('uid-m', profile({ email: 'm@example.com' }))
  const db = asUser('uid-m', 'm@example.com')
  await assertFails(updateDoc(doc(db, 'users', 'uid-m'), { membershipAccessPass: 'annual' }))
})

test('a member cannot extend their own confirmed membership', async () => {
  await seed(
    'uid-m',
    profile({
      email: 'm@example.com',
      membershipAccessPass: 'annual',
      membershipConfirmed: true,
      membershipStart: '2026-01-01T00:00:00.000Z',
      membershipExpiry: '2027-01-01T00:00:00.000Z',
    }),
  )
  const db = asUser('uid-m', 'm@example.com')
  await assertFails(
    updateDoc(doc(db, 'users', 'uid-m'), { membershipExpiry: '2030-01-01T00:00:00.000Z' }),
  )
})

test('a member on a confirmed membership can still sign in', async () => {
  await seed(
    'uid-m',
    profile({ email: 'm@example.com', membershipAccessPass: 'annual', membershipConfirmed: true }),
  )
  const db = asUser('uid-m', 'm@example.com')
  await assertSucceeds(
    updateDoc(doc(db, 'users', 'uid-m'), { lastSignInAt: '2026-08-23T12:00:00.000Z' }),
  )
})

test('a member can clear their own lapsed pass but not grant one', async () => {
  await seed(
    'uid-m',
    profile({ email: 'm@example.com', membershipAccessPass: 'annual', membershipConfirmed: true }),
  )
  const db = asUser('uid-m', 'm@example.com')
  await assertSucceeds(
    updateDoc(doc(db, 'users', 'uid-m'), {
      membershipAccessPass: 'none',
      lastUpdatedBy: 'system',
      lastUpdatedAt: '2026-08-30T00:00:00.000Z',
    }),
  )
})

test('a member can self-purchase, pending admin confirmation', async () => {
  await seed('uid-m', profile({ email: 'm@example.com' }))
  const db = asUser('uid-m', 'm@example.com')
  await assertSucceeds(
    updateDoc(doc(db, 'users', 'uid-m'), {
      membershipAccessPass: 'annual',
      membershipConfirmed: false,
      membershipStart: '2026-08-23T00:00:00.000Z',
      membershipExpiry: '2027-08-23T00:00:00.000Z',
      pendingMembership: JSON.stringify({ label: '1 Year', price: '$300' }),
    }),
  )
})

test('a member can self-purchase a punch pass, pending admin confirmation', async () => {
  await seed('uid-m', profile({ email: 'm@example.com' }))
  const db = asUser('uid-m', 'm@example.com')
  // What HomePage writes when someone with no pass buys ten punches and spends
  // one on the way in. It never touches membershipConfirmed: a punch admits a
  // single visit, and pendingPunches is what an admin confirms.
  await assertSucceeds(
    updateDoc(doc(db, 'users', 'uid-m'), {
      membershipAccessPass: 'punch',
      punchPassRemaining: 9,
      pendingPunches: 10,
      lastSignInAt: '2026-08-23T12:00:00.000Z',
    }),
  )
})

test('a member can spend a punch pass on sign-in', async () => {
  await seed('uid-m', profile({ email: 'm@example.com', punchPassRemaining: 5 }))
  const db = asUser('uid-m', 'm@example.com')
  await assertSucceeds(
    updateDoc(doc(db, 'users', 'uid-m'), {
      punchPassRemaining: 4,
      lastSignInAt: '2026-08-23T12:00:00.000Z',
    }),
  )
})

test('an unauthenticated caller cannot write profiles', async () => {
  await seed('uid-m', profile())
  const db = testEnv.unauthenticatedContext().firestore()
  await assertFails(setDoc(doc(db, 'users', 'uid-x'), profile()))
})

// ─── delete: removing the record a member has just claimed ───────────────────

/** A record written before its owner ever signed in, and their claim of it. */
async function seedClaim(recordOver = {}, claimerOver = {}) {
  await seed('imported_1', profile({ email: 'onfile@example.com', ...recordOver }))
  await seed(
    'uid-claimer',
    profile({ email: 'claimer@example.com', linkedFrom: 'imported_1', ...claimerOver }),
  )
  return asUser('uid-claimer', 'claimer@example.com')
}

test('a member can delete the pre-registration record they claimed', async () => {
  const db = await seedClaim()
  await assertSucceeds(deleteDoc(doc(db, 'users', 'imported_1')))
})

test('the claim tolerates case and padding in the legal name', async () => {
  const db = await seedClaim({ legalName: '  test member  ' }, { legalName: 'Test Member' })
  await assertSucceeds(deleteDoc(doc(db, 'users', 'imported_1')))
})

test('the email-linked member can delete a record already signed in at the desk', async () => {
  // A supervisor signing a walk-in in stamps lastSignInAt on their
  // pre-registration record. That blocks a name claim, but not this member:
  // the address on the record is the one they are signed in with.
  await seed(
    'imported_1',
    profile({
      email: 'claimer@example.com',
      legalName: 'Someone Else Entirely',
      lastSignInAt: '2026-08-30T18:00:00.000Z',
    }),
  )
  await seed('uid-claimer', profile({ email: 'claimer@example.com', linkedFrom: 'imported_1' }))
  const db = asUser('uid-claimer', 'claimer@example.com')
  await assertSucceeds(deleteDoc(doc(db, 'users', 'imported_1')))
})

test('a member cannot delete a record under a different legal name', async () => {
  const db = await seedClaim({ legalName: 'Someone Else' })
  await assertFails(deleteDoc(doc(db, 'users', 'imported_1')))
})

test('a member cannot delete a record they do not name in linkedFrom', async () => {
  await seed('victim_doc', profile({ email: 'victim@example.com' }))
  const db = await seedClaim()
  await assertFails(deleteDoc(doc(db, 'users', 'victim_doc')))
})

test('a name claim now reaches records with real history', async () => {
  // This inverts what it used to assert, and it is the widest thing in these
  // rules. The old bar — no waiver, no sign-in, no confirmation by its owner —
  // excluded exactly the records a member signing in under a new address needs
  // found: real members, with a membership and years behind them. A record was
  // overwritten with a blank one in production because of it.
  //
  // What bounds the delete is unchanged: it grants nothing the claim did not.
  // Anyone who gets here has already had the record moved onto their account,
  // and the original is an empty duplicate at that point.
  for (const used of [
    { waiverMembership: JSON.stringify({ signedAt: '2026-01-01', signedBy: 'Test Member' }) },
    { waiverLiability: JSON.stringify({ signedAt: '2026-01-01', signedBy: 'Test Member' }) },
    { lastSignInAt: '2026-08-30T18:00:00.000Z' },
    { profileReviewedAt: '2026-08-30T18:00:00.000Z' },
  ]) {
    await testEnv.clearFirestore()
    const db = await seedClaim(used)
    await assertSucceeds(deleteDoc(doc(db, 'users', 'imported_1')))
  }
})

test('a record with no legal name cannot be claimed by a member without one', async () => {
  // Empty matching empty would make every nameless record claimable by every
  // member who has not filled one in.
  const db = await seedClaim({ legalName: '' }, { legalName: '' })
  await assertFails(deleteDoc(doc(db, 'users', 'imported_1')))
})

test('a claimed staff record can be removed, or the member is duplicated', async () => {
  // The inverse of what this asserted before, and the reason is arithmetic
  // rather than taste. The create branch refuses a name-matched document
  // holding either flag, so the copy drops them; while this branch also
  // refused the delete, the original stayed and the member appeared twice —
  // every time, with no path through the pair that ended with one profile.
  for (const flag of [{ isAdmin: true }, { isSupervisor: true }]) {
    await testEnv.clearFirestore()
    const db = await seedClaim(flag)
    await assertSucceeds(deleteDoc(doc(db, 'users', 'imported_1')))
  }
})

test('claiming a staff record still cannot make the claimer staff', async () => {
  // The line the delete does not move. A record is one member's history;
  // isAdmin is control over everyone's, and anyone at all can sign in with a
  // fresh Google account.
  await seed('imported_9', profile({ email: 'onfile@example.com', isAdmin: true }))
  const db = asUser('uid-claimer', 'claimer@example.com')
  await assertFails(
    setDoc(
      doc(db, 'users', 'uid-claimer'),
      profile({ email: 'claimer@example.com', isAdmin: true, linkedFrom: 'imported_9' }),
    ),
  )
})

test('a member cannot delete another member outright', async () => {
  await seed('uid-victim', profile({ email: 'victim@example.com' }))
  await seed('uid-m', profile({ email: 'm@example.com' }))
  const db = asUser('uid-m', 'm@example.com')
  await assertFails(deleteDoc(doc(db, 'users', 'uid-victim')))
})

test('a member cannot repoint linkedFrom after creating their profile', async () => {
  // Write-once is what bounds the delete branch: whatever record a member
  // named as they signed up is the only one they can ever remove.
  await seed('uid-m', profile({ email: 'm@example.com', linkedFrom: 'imported_1' }))
  const db = asUser('uid-m', 'm@example.com')
  await assertFails(updateDoc(doc(db, 'users', 'uid-m'), { linkedFrom: 'victim_doc' }))
})

test('a member cannot repoint linkedFrom by hiding it in a purchase', async () => {
  // The write above is refused by the profile branch of `allow update`, but a
  // member's own write reaches their document down two branches, and the
  // second one asks about roles and purchases rather than about this field.
  // A purchase is a write that branch exists to allow, so it is the shape
  // anyone repointing the field would actually use.
  await seed('uid-m', profile({ email: 'm@example.com', linkedFrom: 'imported_1' }))
  const db = asUser('uid-m', 'm@example.com')
  await assertFails(
    updateDoc(doc(db, 'users', 'uid-m'), {
      linkedFrom: 'victim_doc',
      membershipAccessPass: 'annual',
      membershipConfirmed: false,
    }),
  )
})

test('an admin can still repair a linkedFrom', async () => {
  await seed('uid-admin', profile({ email: 'admin@example.com', isAdmin: true }))
  await seed('uid-m', profile({ email: 'm@example.com', linkedFrom: 'imported_1' }))
  const db = asUser('uid-admin', 'admin@example.com')
  await assertSucceeds(updateDoc(doc(db, 'users', 'uid-m'), { linkedFrom: 'imported_2' }))
})

test('an admin can still delete anyone', async () => {
  await seed('uid-admin', profile({ email: 'admin@example.com', isAdmin: true }))
  await seed(
    'uid-victim',
    profile({ email: 'victim@example.com', waiverMembership: '{"signedAt":"2026-01-01"}' }),
  )
  const db = asUser('uid-admin', 'admin@example.com')
  await assertSucceeds(deleteDoc(doc(db, 'users', 'uid-victim')))
})

test('a member claiming by legal name still cannot carry roles across', async () => {
  // registerOrClaimProfile() forces both flags false; the rules say so too,
  // since a name-matched claim only ever reaches the self-create branch.
  await seed('imported_2', profile({ email: 'onfile@example.com', isSupervisor: true }))
  const db = asUser('uid-claimer', 'claimer@example.com')
  await assertFails(
    setDoc(
      doc(db, 'users', 'uid-claimer'),
      profile({ email: 'claimer@example.com', isSupervisor: true, linkedFrom: 'imported_2' }),
    ),
  )
})
