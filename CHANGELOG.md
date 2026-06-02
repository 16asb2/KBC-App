# Changelog

All notable changes to KBC Scheduler are documented here.

---

## [Infrastructure] — 2026-06-02

### Migration: personal account → KBC-owned accounts

Migrated all project infrastructure from personal account (`16asb2@gmail.com`) to
the KBC gym account (`kingstonboulderingcooperative@gmail.com`).

#### Firebase
- New Firebase project: `kbc-app-3307b` (project number `451887190936`)
- Registered Android app with package `com.kbc.app`
- Registered iOS app with bundle ID `com.kbc.app`
- Registered Web app (`kbc-app-admin`) for admin-web hosting
- Firestore security rules redeployed; `isSuperAdmin()` updated to KBC email
- `.firebaserc` updated to point to `kbc-app-3307b`

#### Google Cloud Console (`kbc-app-3307b`)
- Web OAuth 2.0 client: `451887190936-inusdgb37bg3n59n5unp9dobtf4lmqt7`
- iOS OAuth 2.0 client: `451887190936-1lk1q56has03h02fgjm9lliso5384blc`
- Desktop OAuth 2.0 client created for admin token script (one-time use)
- Admin refresh token re-obtained for `kingstonboulderingcooperative@gmail.com` via `scripts/get-admin-token.js`

#### Expo / EAS
- New Expo account: `kbc-climb`
- New EAS project: `kbc-climb/kbc` (ID `695c47fa-5eb2-4e32-a1c8-e789ddd3defc`)
- All `EXPO_PUBLIC_*` environment variables added to Expo dashboard

#### app.json
- Package name: `com.kbcscheduler.app` → `com.kbc.app`
- Slug: `kbc-scheduler` → `kbc`
- Scheme: `volunteerscheduler` → `kbc`
- iOS bundle identifier: `com.kbc.app` (added)
- iOS URL scheme: updated to new OAuth client
- EAS project ID: updated to new project

#### Cloudflare Worker (`kbc-admin-token`)
- Worker re-deployed under KBC Cloudflare account
- Worker URL: `https://kbc-admin-token.kingstonboulderingcooperative.workers.dev`
- Secrets set: `GOOGLE_ADMIN_CLIENT_ID`, `GOOGLE_ADMIN_CLIENT_SECRET`, `GOOGLE_ADMIN_REFRESH_TOKEN`
- `wrangler.toml`: `FIREBASE_PROJECT_ID` updated to `kbc-app-3307b`

#### Admin web (`admin-web/`)
- Firebase config updated to new project
- `WEB_CLIENT_ID` updated to new OAuth client
- `KBC_ADMIN_EMAIL` updated to `kingstonboulderingcooperative@gmail.com`

---

## [0.2.3] — 2026-05-29

### Added
- **Admin web app** (`admin-web/`): standalone admin tool hosted at `kbc-admin.web.app`. Accessible only to members with `isAdmin` or `isSupervisor` set on their Firestore profile. Sections:
  - **Logbook** — date-range table of sign-in entries; export as CSV, PDF, or save PDF to Google Drive.
  - **Members** — full member directory with status filter; export as PDF or save to Drive.
  - **Waivers** — lists all members with a signed liability waiver; generate individual PDFs or save all to Drive at once.
  - **Receipts** — filters logbook for purchase events (entries with "Purchased:" or "Voucher code:" in notes); generate a PDF receipt per entry.
  - **Backup** — full JSON snapshot of Firestore (members, logs, boulders); download locally or save to Drive.
  - **Google Drive integration** — "☁ Drive" button in the header triggers a one-time OAuth consent (GIS token client, `drive.file` scope). On first use, a `KBC Admin/` folder structure is created automatically in the signed-in user's Drive (`Logbook Exports`, `Member Reports`, `Waivers`, `Receipts`, `Backups`). Folder IDs are cached in `localStorage` to avoid redundant API calls.
- **Access Passes — Voucher option**: new "Voucher" entry in the access pass list. Selecting it shows a text input for the voucher number (confirm button disabled until filled). Logs `accessType: Voucher` and `notes: Voucher code: <code>` in the sign-in book; only updates `lastSignInAt` on the member profile (no membership fields changed).
- **Boulder quality votes — standalone field**: `boulder.qualityVotes: Record<uid, number>` replaces per-log quality storage. One vote per user, voted from the Boulder Overview modal (same pattern as grade votes and likes). The `setQualityVote()` service function handles optimistic updates and Firestore persistence.

### Changed
- **KBC grade bar — pink color**: lightened from `#e8559a` to `#f5a5c9` for better visual balance across the 5-color grade spectrum.
- **KBC grade bar — community average marker**: changed from orange (`#FF6600`) to solid yellow (`#FFE600`), matching the effort bar marker color.
- **Effort bar marker**: restructured from inside the track (clipped by `overflow: hidden`) to a sibling View using the same flex-based absolute positioning as the grade bar marker. Marker now extends 2 px above and below the track on both ends.
- **Boulder Overview — Personal Comments position**: moved to the bottom of the overview modal, after the Personal Climb Log section (previously appeared before community badges).
- **Boulder Overview — Quality votes source**: star rating in the overview now reads from `boulder.qualityVotes` directly with local optimistic state; log-entry quality data is no longer used for community display. Quality input removed from the log entry modal entirely.

---

## [Unreleased] — 2026-05-20

### Added
- **Boulder List — Camera icon on cards**: a 📷 indicator appears in the top-right of any ClimbCard that has a photo stored, so photo availability is visible without opening the problem.
- **Boulder Edit — Admin grade vote deletion**: admins and supervisors can tap ✕ next to any individual grade vote (including the setter's initial vote) to remove it. Changes apply immediately without requiring a form save.
- **Personal Climb Log — Photo field**: the Edit Climb form now includes a photo picker and preview (base64, quality 0.4). Photos persist across app reinstalls because they are stored as base64 data URIs rather than local file paths.
- **Boulder photos — Pinch-to-zoom**: tapping a boulder photo opens a full-screen viewer with pinch-to-zoom, pan, and double-tap-to-zoom-reset gestures (Reanimated 4 + RNGH 2). Single-tap closes the viewer.

### Changed
- **Grade bar — Community average marker**: color changed from fluorescent green to bright orange (`#FF6600`) to contrast with both the bar colors and the user's own vote marker (teal green).
- **Boulder Overview — Photo height**: preview image height reduced from 220 px to 140 px so more of the overview card content is visible without scrolling.
- **Boulder Edit — Field order**: form reorganized top-to-bottom as: boulder number → name → tape color → setter → location → grade bar → grade votes list → photo → badges. Discussion section removed.
- **Boulder Edit — Badges**: badge grid is always expanded; collapsible dropdown removed.
- **Boulder Edit — Close returns to Overview**: dismissing or saving the edit form returns to the Boulder Overview card instead of dropping back to the list.
- **Boulder Overview — "Ascent Log" → "Personal Climb Log"**: section renamed and now shows only the current user's own entries on a white background.

### Fixed
- **Boulder photos going black**: replaced ephemeral `file://` URIs (invalidated on every EAS rebuild) with base64 data URIs stored directly in Firestore. Existing photos stored as `file://` paths display as blank; re-uploading restores them.
- **Climb Log edit — Location field blank**: modal re-initialisation was using a render-time `useRef` mutation that is silently skipped under React New Architecture's concurrent renderer. Replaced with `useEffect([editingClimb?.id, visible])`, which reliably runs after the commit phase.

---

## [Unreleased] — 2026-05-19

### Added
- **Climb Log — Sort bar**: horizontal chip row (↓ Date, ↑ Date, A–Z, Z–A, ★ Stars) above the list; replaces the sort option that was buried in the filter modal. Sort is preserved when opening/closing the filter modal.
- **Climb Log — Date section dividers**: when sorted by date, entries are grouped under "Today", "Yesterday", or full weekday + date headers. Other sort modes show a flat list.
- **Climb Log — `userName` saved on new entries**: display name is now stored on every new `climbLogs` document so the Ascent Log table in boulder overviews can show real names instead of anonymous fallbacks.
- **Boulder Overview — Personal Comments panel**: shows the current user's own climb notes with timestamps; other users' notes are not visible here.
- **Boulder Overview — Stats banner**: side-by-side "My" and "Total" sent/attempt counts.
- **Boulder Overview — Ascent Log table**: per-user log of all sends and attempts with timestamps; displays the actual name for new entries, "Member …xxxx" fallback for older ones.
- **Boulder List — User sents/attempts on cards**: fluorescent-green send/attempt counts shown on each ClimbCard for the current user.
- **Boulder List — "Only unsent" filter**: hides problems the current user has already sent.
- **Boulder Edit — Grade votes table**: visible to the problem owner and admins; lists every grade vote with a color-coded grade chip.

### Changed
- **Grade bar marker**: community-average marker changed from red to fluorescent green (`#AAFF00`), 4 px wide, extends 2 px beyond the bar height on both ends so it is slightly taller than the bar.
- **Boulder List — scroll position preserved**: returning from a boulder overview no longer resets the list scroll position or clears active filters.
- **Climb Log — Personal Grade field removed**: the per-entry personal grade input has been removed from the log entry form (existing stored data is preserved).
- **Climb Log — Filter count**: sort order no longer counts as an active filter (it lives in the always-visible sort bar instead).

### Fixed
- **Climb Log — Sector/area not saved on edit**: opening an existing log entry now correctly pre-selects and saves the stored sector/area instead of always defaulting to the first one.
- **Firebase 401 after inactivity**: `getFirebaseToken()` now returns the cached (still-valid) token as a fallback when all refresh paths fail, rather than returning `null` and sending unauthenticated requests.
- **Calendar join — legacy events lose supervisor name**: joining a supervisor session that predates participant tracking no longer overwrites the original supervisor; participants are reconstructed from the event title before appending the new joiner.
- **Calendar cancel — name not removed from title**: leaving a session now correctly filters participants by both UID and display name, handling both tracked and legacy (title-reconstructed) entries; the event title is rebuilt without the cancelled user.
- **Calendar join — supervisor badge**: users who are supervisors and join a session are correctly labelled `(super)` in the rebuilt event title.

---

## [0.2.x] — previous

### Fixed
- **Google Sign-In `DEVELOPER_ERROR` on dev builds** — EAS creates a separate keystore per Android package name. The SHA-1 for `com.kbcscheduler.app.dev` was not registered in Firebase, causing sign-in to fail immediately on development builds. Fixed by registering the correct SHA-1 for each package in Firebase Console and re-downloading `google-services.json`.
- **Firebase UID vs Google user ID mismatch** — `context/auth.tsx` was storing the Google user ID as `user.id`, but Firestore rules compare against the Firebase Auth UID (`localId` from Identity Toolkit). Fixed by extracting `localId` from the `signInWithIdp` response.
- **Race condition on sign-in causing 403s on first load** — `setUser()` was called before `exchangeGoogleIdToken()` completed. Fixed by registering the auth bridge and storing the Firebase token before calling `setUser()`.
- **`personalProblems` collection returning 403** — missing `authBridge` import and missing Firestore security rule. Fixed both.
- **`google-services.json` OAuth client entries** — both Android apps now have the correct SHA-1 Android OAuth clients alongside the shared web client.

### Changed
- **Log form parity across all entry points** — `BoulderLogModal` and `PersonalLogModal` now expose the same fields as the Log Book form, including attempts, quality star rating, badges, and the `EffortBar` continuous slider (replacing string-based Easy/Medium/Hard/Impossible chips).
- **Auto-fill on Climbs-tab log forms** — location, area, name, and grade are pre-populated from the boulder/problem definition.
- **Build configuration** — `app.config.js` and `app.json` aligned with EAS project ID and Android package variants.

---

## [0.2.0] — 2025-05-12

### Added
- Boulder summary screen with bar charts of personal climb history.
- Setter badge votes on boulder detail.
- EAS build workflow with Firebase App Distribution for internal preview builds.

### Fixed
- Badge list display bug.
- Community grade voting decoupled from personal grade.
- Log button added to boulder Overview modal.
- 5-box personal grade selector in climb log.
- `orderBy` removed from Firestore equality-filter queries (requires composite index — sorted client-side instead).
- Sort bar layout fixes.
- UI polish and sign-in history fixes.
