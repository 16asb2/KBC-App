import { initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)

/**
 * Auth that keeps you signed in across launches, and lets you leave when you
 * actually mean to.
 *
 * Reopening the app should not cost a sign-in — most members use their own
 * phone, every visit, and a login screen between them and the sign-in button is
 * friction for no gain. So the session persists, as it always did.
 *
 * Switching accounts is handled at the other end instead, by the
 * `select_account` prompt below: signing out and back in lands you on Google's
 * chooser rather than silently back on the account you were leaving. That was
 * the half of this that was actually broken. Dropping the session on every
 * close was tried first and traded a daily cost on every member's own phone for
 * a problem that only bit when somebody deliberately signed out.
 *
 * Persistence is passed to `initializeAuth` rather than set afterwards with
 * `setPersistence()`, which returns a promise — until it settles the SDK is
 * still on its default, so the choice is only really made here. The list
 * mirrors what `getAuth()` would pick on its own: IndexedDB where it exists,
 * localStorage where it does not (Safari private browsing, chiefly). The popup
 * resolver has to be named explicitly too — `initializeAuth` installs no
 * default, and `signInWithPopup` needs one.
 */
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
})

export const db = getFirestore(app)

export const googleProvider = new GoogleAuthProvider()

/**
 * Always show Google's account chooser.
 *
 * Without this, a browser with exactly one Google account signed in skips the
 * chooser entirely and hands that account straight back — so "sign out, sign in
 * as someone else" silently returns you to the account you were trying to leave.
 * `select_account` is the narrow fix: it asks *which* account, without also
 * re-prompting for consent the way `prompt: 'consent'` would.
 */
googleProvider.setCustomParameters({ prompt: 'select_account' })
