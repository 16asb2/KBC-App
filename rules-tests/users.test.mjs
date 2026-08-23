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
 */

import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc } from 'firebase/firestore'

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
    membershipStatus: 'inactive',
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

test('a member cannot self-approve membership to active', async () => {
  await seed('uid-m', profile({ email: 'm@example.com' }))
  const db = asUser('uid-m', 'm@example.com')
  await assertFails(updateDoc(doc(db, 'users', 'uid-m'), { membershipStatus: 'active' }))
})

test('a member can self-purchase, pending admin confirmation', async () => {
  await seed('uid-m', profile({ email: 'm@example.com' }))
  const db = asUser('uid-m', 'm@example.com')
  await assertSucceeds(
    updateDoc(doc(db, 'users', 'uid-m'), {
      membershipStatus: 'pending',
      membershipStart: '2026-08-23T00:00:00.000Z',
      membershipExpiry: '2027-08-23T00:00:00.000Z',
      pendingMembership: JSON.stringify({ label: '1 Year', price: '$300' }),
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
