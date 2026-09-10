/**
 * Security-rules tests for the `media/main` subdocuments in ../firestore.rules.
 *
 *   npm run test:emulated          (needs Java — the Firestore emulator is a JVM app)
 *
 * These subcollections are new, and they exist for a performance reason rather
 * than a permissions one: a base64 photo stored as a *field* is downloaded by
 * every query over its collection, and the Boulders tab reads both `boulders`
 * and `climbLogs` whole. Moving the bytes into a subdocument keeps them out of
 * those reads (see web/src/services/photoStore.ts and DESIGN.md).
 *
 * The reason for testing them is that moving data also moves the rule guarding
 * it, and a subcollection does **not** inherit its parent's. Get that wrong and
 * a photo is either unreachable or world-readable, and neither shows up as a
 * failure in the app. A boulder photo stays admin-writable, like the `photo`
 * field it replaces; a climb photo is readable only by the member who took it.
 *
 * That last one is a deliberate tightening. A KBC climb log is readable by
 * every member so the community counts on the boulder cards work; the photo
 * attached to it was never displayed to anyone, and now cannot be.
 */

import test from 'node:test'
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import { createTestEnv } from './harness.mjs'

const testEnv = await createTestEnv(import.meta.url)

/** Seed bypassing rules, the way the data would already exist. */
async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path), data)
  })
}

function asUser(uid, email) {
  return testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore()
}

/** The member document isSupervisorOrAdmin() reads to decide. */
async function seedMember(uid, email, roles = {}) {
  await seed(['users', uid], { name: 'Member', email, isAdmin: false, isSupervisor: false, ...roles })
}

const PHOTO = 'data:image/jpeg;base64,/9j/AAAA'

test.beforeEach(async () => {
  await testEnv.clearFirestore()
})

test.after(async () => {
  await testEnv.cleanup()
})

// ── boulders/{id}/media/main ────────────────────────────────────────────────

test('any member can read a boulder photo', async () => {
  await seed(['boulders', 'b1'], { name: 'Test', seasonId: 's1', hasPhoto: true })
  await seed(['boulders', 'b1', 'media', 'main'], { photo: PHOTO })
  await seedMember('uid-m', 'member@example.com')

  const db = asUser('uid-m', 'member@example.com')
  await assertSucceeds(getDoc(doc(db, 'boulders', 'b1', 'media', 'main')))
})

test('an ordinary member cannot write a boulder photo', async () => {
  // Same permission as the `photo` field this replaced: 'photo' is in
  // touchesBoulderAdminFields, so setting it was already admin-only.
  await seed(['boulders', 'b1'], { name: 'Test', seasonId: 's1' })
  await seedMember('uid-m', 'member@example.com')

  const db = asUser('uid-m', 'member@example.com')
  await assertFails(setDoc(doc(db, 'boulders', 'b1', 'media', 'main'), { photo: PHOTO }))
})

test('a supervisor can write and delete a boulder photo', async () => {
  await seed(['boulders', 'b1'], { name: 'Test', seasonId: 's1' })
  await seedMember('uid-sup', 'sup@example.com', { isSupervisor: true })

  const db = asUser('uid-sup', 'sup@example.com')
  await assertSucceeds(setDoc(doc(db, 'boulders', 'b1', 'media', 'main'), { photo: PHOTO }))
  await assertSucceeds(deleteDoc(doc(db, 'boulders', 'b1', 'media', 'main')))
})

test('a signed-out visitor cannot read a boulder photo', async () => {
  await seed(['boulders', 'b1'], { name: 'Test', seasonId: 's1' })
  await seed(['boulders', 'b1', 'media', 'main'], { photo: PHOTO })

  const db = testEnv.unauthenticatedContext().firestore()
  await assertFails(getDoc(doc(db, 'boulders', 'b1', 'media', 'main')))
})

// ── climbLogs/{id}/media/main ───────────────────────────────────────────────

test('a member can read and write the photo on their own climb', async () => {
  await seed(['climbLogs', 'c1'], { uid: 'uid-owner', locationId: 'kbc' })
  await seedMember('uid-owner', 'owner@example.com')

  const db = asUser('uid-owner', 'owner@example.com')
  const ref = doc(db, 'climbLogs', 'c1', 'media', 'main')
  await assertSucceeds(setDoc(ref, { photo: PHOTO, uid: 'uid-owner' }))
  await assertSucceeds(getDoc(ref))
  await assertSucceeds(deleteDoc(ref))
})

test('another member cannot read a climb photo, even on a KBC log they can read', async () => {
  // The parent is deliberately readable by everyone — the boulder cards count
  // sends and attempts out of it. The photo is not part of that.
  await seed(['climbLogs', 'c1'], { uid: 'uid-owner', locationId: 'kbc' })
  await seed(['climbLogs', 'c1', 'media', 'main'], { photo: PHOTO, uid: 'uid-owner' })
  await seedMember('uid-other', 'other@example.com')

  const db = asUser('uid-other', 'other@example.com')
  await assertSucceeds(getDoc(doc(db, 'climbLogs', 'c1'))) // the log itself: yes
  await assertFails(getDoc(doc(db, 'climbLogs', 'c1', 'media', 'main'))) // the photo: no
})

test('a member cannot attach a photo to a climb that is not theirs', async () => {
  await seed(['climbLogs', 'c1'], { uid: 'uid-owner', locationId: 'kbc' })
  await seedMember('uid-other', 'other@example.com')

  const db = asUser('uid-other', 'other@example.com')
  await assertFails(
    setDoc(doc(db, 'climbLogs', 'c1', 'media', 'main'), { photo: PHOTO, uid: 'uid-owner' }),
  )
})

test('a member cannot create a climb photo claiming to be someone else', async () => {
  // The owner is carried on the media document because the rules cannot read
  // the parent's without paying for a get() on every evaluation. That only
  // holds if a create must name itself honestly.
  await seed(['climbLogs', 'c1'], { uid: 'uid-owner', locationId: 'kbc' })
  await seedMember('uid-other', 'other@example.com')

  const db = asUser('uid-other', 'other@example.com')
  await assertFails(
    setDoc(doc(db, 'climbLogs', 'c1', 'media', 'main'), { photo: PHOTO, uid: 'uid-other-lies' }),
  )
})

test('an admin cannot read a climb photo belonging to a member', async () => {
  // Unlike boulder photos, these are not gym property.
  await seed(['climbLogs', 'c1'], { uid: 'uid-owner', locationId: 'kbc' })
  await seed(['climbLogs', 'c1', 'media', 'main'], { photo: PHOTO, uid: 'uid-owner' })
  await seedMember('uid-admin', 'admin@example.com', { isAdmin: true })

  const db = asUser('uid-admin', 'admin@example.com')
  await assertFails(getDoc(doc(db, 'climbLogs', 'c1', 'media', 'main')))
})
