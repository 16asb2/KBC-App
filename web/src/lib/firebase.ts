import { initializeApp } from 'firebase/app'
import {
  browserPopupRedirectResolver,
  browserSessionPersistence,
  GoogleAuthProvider,
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
 * Auth that does **not** sign anyone back in on its own.
 *
 * `getAuth()` defaults to `browserLocalPersistence`, which keeps the session in
 * IndexedDB and restores it on every launch. On a personal phone that is a
 * convenience; on a shared one — the tablet at the gym, or a member borrowing
 * someone's handset — it means whoever signed in last stays signed in, and the
 * login screen is never seen again. Session persistence keeps you signed in
 * while the app is open (a reload or a page refresh is fine) and drops the
 * session when it closes, so the next launch starts at the login screen.
 *
 * Set through `initializeAuth` rather than a `setPersistence()` call after the
 * fact: that returns a promise, and until it settles the SDK is still on the
 * default, so a restored session can surface through `onAuthStateChanged`
 * before the switch lands. Passing it here means there is no window where the
 * old behaviour applies. The popup resolver has to be named explicitly too —
 * `initializeAuth` installs no default, and `signInWithPopup` needs one.
 */
export const auth = initializeAuth(app, {
  persistence: browserSessionPersistence,
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
