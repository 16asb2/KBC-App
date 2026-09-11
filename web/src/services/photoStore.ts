import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Photos, kept out of the documents that list them.
 *
 * A picture in this app is a base64 JPEG data URI. Stored as a field on the
 * document it belongs to, it is downloaded by every query that touches that
 * collection — and the two collections that carried one are both read *whole*
 * by the Boulders tab. A season of problems and every KBC climb ever logged
 * came down the wire complete with pictures that screen never draws, which is
 * most of why it crawled on iPhone (see DESIGN.md).
 *
 * So a photo lives in its own subdocument, `<collection>/<id>/media/main`,
 * fetched only by the one screen that shows it. Subcollections are not returned
 * by a query on their parent, which is the whole property being bought here.
 *
 * The card-sized `thumb` stays on the boulder document on purpose: it is a
 * couple of kB, and the list needs every one of them, so a per-boulder round
 * trip would trade a small download for dozens of requests.
 */
const MEDIA_COLLECTION = 'media'
const MEDIA_DOC = 'main'

function mediaRef(collectionId: string, docId: string) {
  return doc(db, collectionId, docId, MEDIA_COLLECTION, MEDIA_DOC)
}

/**
 * The photo for a document, or '' if it has none.
 *
 * Falls back to a `photo` field on the parent, which is where every photo taken
 * before this change still lives. `scripts/migrate-photos.mjs` moves them; until
 * it has been run against a database, both shapes are readable, and after it has
 * the fallback costs one extra read on documents that have no photo at all.
 */
export async function readPhoto(collectionId: string, docId: string): Promise<string> {
  try {
    const snap = await getDoc(mediaRef(collectionId, docId))
    const photo = snap.exists() ? snap.data().photo : null
    if (typeof photo === 'string' && photo) return photo
  } catch {
    // fall through to the legacy field
  }
  try {
    const parent = await getDoc(doc(db, collectionId, docId))
    const legacy = parent.exists() ? parent.data().photo : null
    return typeof legacy === 'string' ? legacy : ''
  } catch {
    return ''
  }
}

/**
 * Store a photo, or remove it when `photo` is empty.
 *
 * `owner` is copied onto the subdocument because `firestore.rules` cannot see a
 * parent's fields without paying for a read of it on every evaluation. Pass the
 * same uid the parent carries — for boulders, which are admin-writable rather
 * than owner-writable, pass nothing.
 */
export async function writePhoto(
  collectionId: string,
  docId: string,
  photo: string,
  owner?: string,
): Promise<void> {
  if (!photo) {
    await deletePhoto(collectionId, docId)
    return
  }
  await setDoc(mediaRef(collectionId, docId), {
    photo,
    ...(owner ? { uid: owner } : {}),
    updatedAt: new Date().toISOString(),
  })
}

export async function deletePhoto(collectionId: string, docId: string): Promise<void> {
  try {
    await deleteDoc(mediaRef(collectionId, docId))
  } catch {
    // Deleting a photo that was never there is not a failure worth surfacing.
  }
}
