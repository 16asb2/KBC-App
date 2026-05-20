# Changelog

All notable changes to KBC Scheduler are documented here.

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
