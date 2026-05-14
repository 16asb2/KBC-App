# Changelog

All notable changes to KBC Scheduler are documented here.

## [Unreleased]

### Fixed
- **Google Sign-In `DEVELOPER_ERROR` on dev builds** — EAS creates a separate keystore per Android package name. The SHA-1 for `com.kbcscheduler.app.dev` (`83:A3:21:…`) was not registered in Firebase, causing sign-in to fail immediately on development builds. Fixed by registering the correct SHA-1 for each package in Firebase Console and re-downloading `google-services.json`.
- **Firebase UID vs Google user ID mismatch** — `context/auth.tsx` was storing the Google user ID (`response.data.user.id`) as `user.id`, but Firestore rules compare `request.auth.uid` against the Firebase Auth UID (`localId` from Identity Toolkit). All Firestore field-level checks (`resource.data.uid == request.auth.uid`) were silently failing. Fixed by extracting `localId` from the `signInWithIdp` response and using it as `user.id` in both `signIn()` and `restoreSession()`.
- **Race condition on sign-in causing 403s on first load** — `setUser()` was called before `exchangeGoogleIdToken()` completed, so `ProfileContext` fired Firestore reads before the Firebase token was stored. Fixed by registering the auth bridge and storing the Firebase token before calling `setUser()`.
- **`personalProblems` collection returning 403** — `services/personalProblems.ts` had no `authBridge` import, so all requests were unauthenticated. Also, the `personalProblems` collection had no Firestore security rule (default deny). Fixed both: added `Authorization: Bearer` header to all REST calls and added the missing rule to `firestore.rules`.
- **`google-services.json` OAuth client entries** — Both Android apps now have the correct SHA-1 Android OAuth clients (`client_type: 1`) alongside the shared web client (`client_type: 3`), enabling Google Sign-In for both dev (`com.kbcscheduler.app.dev`) and preview/production (`com.kbcscheduler.app`) builds from a single file.

### Changed
- **Log form parity across all entry points** — The KBC boulder log modal (`BoulderLogModal`) and personal problem log modal (`PersonalLogModal`) in the Climbs tab now expose the same fields as the Log Book's add/edit form:
  - *PersonalLogModal*: added **attempts** input (was hardcoded `0`), **quality** star rating (was hardcoded `0`), and an expandable **badges** section (was hardcoded `[]`).
  - *BoulderLogModal* & *PersonalLogModal*: effort input replaced from a fixed chip selector (Easy / Medium / Hard / Impossible stored as strings) to the `EffortBar` continuous slider (stored as `number`, consistent with how the Log Book saves and displays effort).
- **Auto-fill on Climbs-tab log forms** — When logging from a boulder card or personal problem card, location, area, name, and grade are pre-populated from the boulder/problem definition; only session-specific fields (date, type, attempts, grade vote, quality, effort, badges, notes) require user input.
- **Build configuration** — `app.config.js` and `app.json` aligned with EAS project ID and Android package variants for dev and production flavors.
