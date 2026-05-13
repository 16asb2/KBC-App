# Changelog

## [Unreleased] — UI improvements + Firestore security rules

### Security
- **Firestore security rules deployed** — replaced the temporary open `allow read/write: if true` with production-ready per-collection rules (see `firestore.rules`):
  - All unauthenticated access blocked
  - Super-admin bootstrapped via hardcoded email; admins and supervisors identified via `members/{uid}.isAdmin / isSupervisor` in Firestore
  - Members can vote on boulders but cannot change structural boulder fields (name, setter, locations, etc.)
  - Members can update their own profile but cannot escalate privileges (self-promotion to admin/supervisor blocked)
  - Personal climb logs and locations strictly private by UID
  - Sign-in logs readable by all authenticated members; purchase entries filtered client-side for non-supervisors
- Added `.firebaserc` to pin `firebase deploy` to `kbc-app-dev`

### Added — Log Book (Sign-In Book)
- **Date section headers** — entries grouped by calendar day with "Monday, May 13, 2026" subheadings; time column now shows time only (date carried by the header)
- **Name search bar** — real-time filter by member name with a clear ✕ button, below the Recent / Archive toggle

### Added — Personal Climbs (Log Book tab)
- **Filter modal** — ⚙ button in top bar opens a filter sheet with:
  - Climb Type: All / ✓ Sent / △ Attempted
  - Projects Only checkbox
  - Sort Order: Newest first / Oldest first
  - Button shows a badge count and turns cyan when any filter is active

### Added — Climbs tab (KBC boulders)
- **"Projects only" filter** checkbox at top of Filter Boulders modal — shows only boulders the current user has marked as a project
- **Attempts field** in the Log Climb modal (was previously missing from the KBC boulder log flow)
- **Community grade average** (red marker) pre-loaded when the Log Climb modal opens
- **Default attempts = 1** everywhere (log modal, edit modal, new boulder)

### Added — Badge set
- New **Hold Types** badge: `Crack`
- New **Climbing Technique** badges: `Hand-Jam`, `Finger-Jam`, `Foot-Jam`
- New **Others** badges: `Love it`, `Hate it`, `Suffer`

### Changed — Badge set
- Removed badges: `One-try`, `Last-try`, `No-feet`

### Changed — Badge display in list rows
- Badges in Climbs and Log Book list rows: labels retained, compact layout (no fixed column width, left-aligned, `flexWrap: nowrap`, gap 4) — always fits in a single line

### Changed — Grade & effort inputs
- KBC grade slider in the Log Climb modal (Log Book tab) now allows any continuous position — matches behaviour in the Climbs tab (was snapping to discrete label positions)
- Effort bar marker changed from a white circle to a narrow vertical yellow mark

### Fixed
- `expo-image-picker` lazy-loaded with try/catch to prevent crash in Expo Go where the native module is unavailable; photo picker button hidden gracefully when not available
- `attempts` field added to all `addClimb()` call sites that were missing it (TypeScript error after `PersonalClimb.attempts` was introduced as a required field)

---

## [Unreleased] — feat/special-event-improvements

### Schedule tab

- **Date header is now a calendar picker trigger** — tapping the date opens a slide-up `CalendarPicker` modal instead of showing a separate "Today" button; closing the modal keeps the selected day in view.
- **All-day events appear in the timeline** — a sticky banner strip at the top of the timeline shows all-day events for the selected day; previously only `dateTime` events were shown.
- **Event press works for all-day events** — tapping an all-day pill or a future-list row now correctly opens `edit-session` (previously only timed events were handled).
- **Non-supervisors** — the bottom bar now shows only the "Request a climb session" button (purple); supervisors continue to see "+ Climb Session".
- **"+ Special Event" button** extended to supervisors — was previously admin-only.
- **Calendar fetch window** extended from 14 days to 60 days so the calendar tab and upcoming list are populated further ahead.

### Calendar tab

- **Replaced the hand-rolled calendar grid** with the new shared `CalendarPicker` component (same component used in the Schedule tab modal).
- **Upcoming events list** added below the calendar — all events from today onward displayed in chronological order, grouped by date with a "Today / Tomorrow / full date" header.
- **Rows are tappable** — each event row navigates to the `edit-session` detail/edit screen with the same params as tapping in the timeline; works for both timed and all-day events.
- **Color coding** in the list rows matches the schedule legend: pink for supervisor sessions, purple for member requests, cyan for special events.

### New component: `CalendarPicker`

- Shared month-grid calendar with event-dot indicators (pink / purple / cyan per event type).
- Handles month navigation, "today" highlight, and multi-dot indicator per day.
- Used by both the Calendar tab and the Schedule tab's date-picker modal.

### Special events (`add-event`)

- **All-day toggle** — checking "All day" switches to date-only inputs; the event is stored without a time component and shown in the all-day banner on the timeline.
- **Supervisor access** — supervisors can now add special events from the Schedule tab (was admin-only).
- **End-date preservation** — toggling the all-day checkbox no longer resets the end date.

### Session request / supervisor slot reconciliation (`calendarService`)

- **`createSessionRequest`** — before creating, fetches existing supervisor slots and computes the non-overlapping intervals. Only those intervals are created as request events. Throws a clear error if the entire requested time is already covered by a supervisor session. If supervisor slots split the request, multiple shorter request events are created automatically.
- **`createSupervisorEvent`** — after creation, reconciles all requests that overlap with the new slot: fully-contained requests are deleted; partially-overlapping requests are trimmed to the uncovered portion; requests that span the entire slot are split into two.
- **`fulfillSessionRequest`** (new export) — replaces the inline delete-and-create logic in `edit-session`. If the fulfilling supervisor has an existing slot exactly adjacent (end-to-start or start-to-end) to the request, the two are **merged**: the existing slot's time is extended and the requester's name is added to the participants list. Otherwise a new supervisor session is created as before. Either way, any remaining overlapping requests are reconciled after fulfillment.

### Bug fixes

- **Home screen `formatTime`** — replaced `toLocaleTimeString` with a manual `h:mm AM/PM` formatter to fix a React Native rendering inconsistency.
- **Home screen** — special events and the "next session" card now correctly handle all-day events (no longer skipped).

---

## [Unreleased] — feat/security-hardening

### Security

- **Admin OAuth credentials moved off-device**: Created a Cloudflare Worker (`worker/`) as a
  server-side proxy for the KBC admin Google Calendar token. The `GOOGLE_ADMIN_CLIENT_ID`,
  `GOOGLE_ADMIN_CLIENT_SECRET`, and `GOOGLE_ADMIN_REFRESH_TOKEN` are now stored as Cloudflare
  secrets and never included in the app bundle. The app calls the Worker via
  `EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL`; the legacy on-device refresh path remains as a fallback
  for local dev only and should be removed after the admin refresh token is rotated.

- **Worker caller verification**: The Worker validates callers using Google's OAuth tokeninfo
  endpoint (`https://oauth2.googleapis.com/tokeninfo`), confirming the request comes from a
  signed-in Google user before issuing the admin token.

- **Secret scanning in CI**: Added `gitleaks/gitleaks-action@v2` to `.github/workflows/ci.yml`.
  Runs on every push and pull request; blocks merge if secrets are detected in history.

- **SUPER_ADMIN_EMAIL moved to env var**: `constants/admins.ts` now reads the super-admin email
  from `EXPO_PUBLIC_SUPER_ADMIN_EMAIL` instead of a hardcoded personal address. Set in `.env`
  locally and as an EAS environment variable for cloud builds.

### Added

- `worker/` — Cloudflare Worker project (`wrangler.toml`, `src/index.ts`, `tsconfig.json`).
  Deployed at `https://kbc-admin-token.kbcclimb.workers.dev`.

- `services/authBridge.ts` — Module-level token registry so non-React service files can call
  `getFirebaseToken()` and `getAdminCalendarToken()` without React context.

- Firebase Auth integration: `context/auth.tsx` now exchanges the Google ID token for a Firebase
  ID token on sign-in and session restore (`accounts:signInWithIdp`), with automatic refresh via
  `securetoken.googleapis.com`. All Firestore service files send the Firebase ID token as an
  `Authorization: Bearer` header when available.

- `firestore.rules` — Full per-collection security rules written (members, logs, gym status,
  boulders, climb logs, climb locations, session requests). Initially set to open while Firebase
  Auth token exchange was verified; **strict rules subsequently deployed** (see UI improvements
  entry above).

- `firebase.json` — Firestore rules deployment config for `firebase-tools`.

### Changed

- `context/auth.tsx`: `getAdminCalendarToken()` now sends the Google OAuth access token (not the
  Firebase ID token) to the Worker. Unblocks calendar event creation while the Firebase Auth
  token exchange is still being stabilised.

- `services/adminToken.ts`: Now a thin re-export of `getAdminCalendarToken` from `authBridge.ts`
  (was a standalone refresh-token handler with credentials in the bundle).

- `tsconfig.json`: Added `"worker"` to `exclude` so the app type-checker ignores the Worker's
  Cloudflare-typed source.

### Pending

- Rotate the old `GOOGLE_ADMIN_REFRESH_TOKEN` in Google Cloud Console, then remove the
  `EXPO_PUBLIC_GOOGLE_ADMIN_*` legacy vars from `.env`.

---

## v0.4 — 2026-05-11

### Added
- **Members Tab — Access Pass Status**: Replaced generic 4-state membership control with named pass-type buttons (Annual pass / 8-month pass / 4-month pass / 1-month pass / Inactive); end date auto-calculated from start date + duration; admins save directly as active, supervisors save as pending awaiting admin confirmation
- **Members Tab — Pending pass card**: Cancel ✕ and Confirm ✓ buttons side by side (admin only) to reject or activate a supervisor-submitted pending pass
- **Members Tab — Remove Member**: Admins can permanently delete a member and all their sign-in log entries via a destructive confirmation dialog
- **Sign-In Book — Delete entries**: Admins can delete individual sign-in entries; if the deleted entry is within the 24 h window and was the member's most recent sign-in, the 24 h re-entry block is automatically cleared
- **Sign-In Book — Purchase privacy**: Access pass purchase notes are hidden from non-supervisor users
- **Sign-in workflow — Direct sign-in**: Members with an active or pending pass are signed in immediately with no confirmation dialog; log entry records the actual pass name (e.g. "Annual Pass") instead of "Active Member"
- **Add New Member — Preferred Name & Phone**: New optional fields in the create form; preferred name is used as the display name throughout the app
- **Add New Member — Success confirmation**: After creation the form shows a ✅ confirmation screen for 2 seconds before closing
- **Add New Member — Waiver name validation**: Waiver signing requires the typed name to exactly match the member's legal name before the sign button enables
- **Home page — Sign-In Book button**: Repositioned directly below Session Sign-In; both buttons are now the same size and colour (KBC purple)

### Changed
- **Access pass terminology**: All "membership" references in the buy-access flow replaced with "access pass"; option labels updated (e.g. "Month Membership" → "1-month pass", "Student Annual" → "Student annual pass"); per-month price shown inline for multi-month options
- **New member default status**: Manually created member profiles now default to `inactive` instead of `non-member`
- **Gym open/closed status**: Driven entirely from supervisor calendar slots; Firestore `gymStatus` polling removed
- **Home page social buttons**: Discord, Facebook, Instagram replaced with FontAwesome5 brand icons; icon-only square buttons; email button retains icon + address text; email corrected to climb.kbc@gmail.com
- **Home page**: Active climber count removed
- **Members Tab — Supervisor checkbox**: Label simplified to "Supervisor" (removed conditional text)

### Fixed
- `canAmend` check in Sign-In Book now correctly recognises Firestore-managed admins (was only matching super-admin)

---

## v0.3 — 2026-05-10

### Added
- **Climbs tab** (renamed from Boulders) — KBC / Personal mode toggle in the top bar
- **Log-as-history architecture** — all aggregate data (grade votes, quality votes, badge votes, send/attempt counts) moved out of boulder documents into `climbLogs`; aggregates computed client-side via `computeAggregates()` from `utils/climbAggregates.ts`; boulder documents are now static entities
- **`problemInternalId`** — stable cross-collection reference field on every `climbLogs` entry, linking logs to KBC boulders or personal problems
- **`gradeVote: number | null`** — numeric 0–4 stored in each log entry, enables grade averaging without string lookups
- **Personal status pill** on each KBC climb card — ✓ Sent (green) or △ Tried (amber) based on the current user's most recent log entry
- **Setter's log on create** — when a KBC boulder is created with a grade or badges selected, a `climbLogs` entry is written for the setter so their picks count as the first community vote
- **Badge selection in log form** — users can tag badges when logging a KBC boulder (previously badges were only settable on create)
- **Badge display** — top 5 badges in a single compact row (no wrap, tighter spacing)
- **Personal mode** — list of user-owned personal problems loaded from new `personalProblems` Firestore collection
- **LocationsModal** — create, edit, and delete personal climb locations (name, indoors/outdoors toggle, areas/sectors list, optional address and GPS coordinates)
- **Location filter** in Personal mode top bar — dropdown to filter problems by location; Manage button opens LocationsModal
- **NewProblemModal** — full create/edit modal for personal problems with: location picker from saved locations, area picker from location sectors, scrollable grade chip list by grade system; tap any personal problem card to edit it
- **PersonalLogModal** — log sessions against personal problems, writes `climbLogs` entry with correct `problemInternalId`
- **`services/personalProblems.ts`** — Firestore REST CRUD service for `personalProblems` collection
- **`utils/id.ts`** — `generateId()` helper (timestamp + random base-36)
- **`utils/climbAggregates.ts`** — `computeAggregates()` and `getPersonalStatus()` utilities
- **`scripts/reset-db.js`** — Node 18 dev-only script to wipe all Firestore collections (requires "YES" confirmation; does not touch Auth users)
- **Two Firebase projects** — `kbc-app-dev` for local development (`.env`), `kbc-scheduler-929e3` for production (EAS Secrets); dev resets no longer affect production data
- **`migrateBouldersAddFields()`** — one-time helper in `services/boulders.ts` to backfill `internalId`, `local`, `area`, `permissions` on existing boulder documents

### Changed
- KBC boulder logging no longer PATCHes the boulder document — only writes to `climbLogs`
- `climblog.tsx` free-form log entries now carry `gradeVote: null` and `problemInternalId: ''` for schema consistency

### Fixed
- Removed stale Known Issue: "Boulder seasons UI not built" — seasons are live
- Removed stale Known Issue: "Boulder seasons collection exists but season transition UI is not built"

### Known Issues
- No explicit gym close mechanism — status times out after 2 hours
- Waiver has no version tracking
- Calendar access for supervisors still requires manual Google Calendar sharing
- Existing `climbLogs` entries pre-v0.3 have no `problemInternalId` — they appear as free-form entries in the Log Book tab but do not contribute to Climbs tab aggregates

---

## v0.2 — 2026-05

### Added
- **Dynamic admin management** — `isAdmin` field moved from hardcoded file to Firestore; new Admin Management screen lets admins grant/revoke admin status in-app
- **Super-admin** — `SUPER_ADMIN_EMAIL` in `constants/admins.ts` remains hardcoded and irrevocable; all other admin status is Firestore-managed
- **`non-member` membership status** — new 4th status value; new sign-ups default to `non-member` instead of `inactive`; non-members with no punch passes cannot sign in
- **Membership auto-expiry** — `checkAndUpdateMembershipStatus()` runs on sign-in and admin saves; expired memberships auto-transition to `inactive`
- **One-time migration function** — `migrateExistingUsers()` in `services/firestore.ts` backfills `isAdmin`, `membershipStatus`, and `membershipExpiry` for existing documents (call manually)
- **Calendar mediator layer** — all Google Calendar API calls centralised in `services/calendarService.ts`; includes `listUpcomingEvents`, `createSupervisorEvent`, `joinSession`, `deleteSupervisorEvent`, `createMemberRequest`
- **Join Session** — "Join This Session" button on supervisor-created events, visible to all authenticated users; uses `calendarService.joinSession` to append participant to event title and `extendedProperties`
- **Session requests via Firestore** — `createMemberRequest` writes to `sessionRequests` collection; only accessible to active/inactive/pending members (not non-members)
- **Permission enforcement** — non-members hidden from `+ Request` button; non-members blocked at sign-in with clear message; `isAdmin` check now includes Firestore flag across all screens
- **3-state membership badge** — Active (green), Inactive/Pending (orange/grey), Non-member (dark grey) throughout member directory and profile card

### Fixed
- `isAdmin()` now accepts `profileIsAdmin` as second argument — checks both `SUPER_ADMIN_EMAIL` and Firestore `profile.isAdmin`
- Member directory and sign-in flows handle `non-member` status explicitly

### Known Issues
- No explicit gym close mechanism — status times out after 2 hours
- Waiver has no version tracking
- Boulder seasons UI not built
- Calendar access for supervisors still requires manual Google Calendar sharing (ACL API integration planned)

---

## v0.1 — 2026-05

### Added
- Google Sign-In (OAuth 2.0) — all access gated behind Google account
- Member profiles stored in Firestore (name, membership type, punch passes, waiver)
- Dynamic waiver signing flow per membership type (`/waiver/[type]`)
- Sign-in logbook — supervisors can sign in any member or punch pass holder
- Real-time gym open/closed status — triggered by supervisor physical sign-in, stored in `gymStatus/current` Firestore document with 2-hour auto-close window
- Schedule tab — timeline view of upcoming sessions from Google Calendar
- Month calendar view for browsing sessions
- Add/edit climb sessions — supervisors add sessions, regular members request sessions
- Boulder problem database — community list with grade voting, quality voting, badge tagging
- Boulder logging from Boulders tab — logs ascents/attempts, updates community aggregates
- Personal climb logbook — unified log for KBC + custom locations, with grade systems, effort, quality, badges
- Custom climb locations — users can create indoor/outdoor locations with sectors
- Climb summary chart — bar chart of sends vs attempts by grade, with stats pills
- Member directory (admin/supervisor only)
- Supervisor management — admins can grant/revoke supervisor status
- Swipe gesture navigation across all tabs
- KBC grade bar — 5-color interactive slider (White → Black)
- 40 hold-type badge icons rendered with composed View elements (no SVG library)

### Known Issues
- `isAdmin` is hardcoded in `constants/admins.ts` — cannot change without a rebuild
- No explicit gym close mechanism — gym status times out after 2 hours, supervisors cannot close early or extend
- Calendar access for supervisors must be shared manually via Google — no in-app management yet
- Punch pass vs. full membership distinction not fully enforced in UI
- Boulder seasons collection exists in Firestore but season transition UI is not built
- Waiver has no version tracking — existing members won't be re-prompted if waiver text changes

## v0.5 — 2026-05-11

### Added
- **Centralized calendar write architecture** — all Google Calendar write operations (create, update, delete) now flow through a single KBC super-admin Google account via an OAuth 2.0 refresh token stored in `.env`. No individual user's Google account needs write access to the KBC calendar. All events created via the app appear under the admin account in Google Calendar.
- **`services/adminToken.ts`** — exchanges the stored admin refresh token for a short-lived Google OAuth access token; caches in memory with automatic re-fetch ~60 s before expiry (tokens last 1 hour).
- **`scripts/get-admin-token.js`** — one-time Node.js helper to obtain the super-admin refresh token. Opens a local OAuth consent flow (Desktop app client, localhost redirect), then writes the resulting refresh token directly to `.env`. Re-run whenever the Desktop OAuth client is rotated.
- **`updateSupervisorEvent`** in `calendarService.ts` — new export; PATCHes an existing supervisor session's time, title, or supervisor flag.
- **`createSessionRequest`** in `calendarService.ts` — new export; creates a member-requested session on the calendar under the admin account (title suffix `(requested)`).
- **`createSpecialEvent`** in `calendarService.ts` — new export; creates non-session events (competitions, workshops, etc.) with a free-form title.

### Changed
- **`joinSession`** — changed from delete + create (which needlessly changed the event ID) to a `PATCH` request; event ID is now stable across participant joins.
- **All write functions** — `createSupervisorEvent`, `joinSession`, `updateSupervisorEvent`, `deleteSupervisorEvent`, `createSessionRequest`, `createSpecialEvent` no longer accept a caller-supplied OAuth token; they obtain the admin token internally via `getAdminCalendarToken()`.
- **`listUpcomingEvents`** — read-only; still accepts the signed-in user's token (no change needed).
- **`context/schedule.tsx`** — switched from retired `fetchEvents` to `listUpcomingEvents` from `calendarService.ts`.
- **`app/add-session.tsx`** — recoded to use `createSupervisorEvent` / `createSessionRequest`; user token no longer passed for writes.
- **`app/edit-session.tsx`** — recoded to use `updateSupervisorEvent`, `deleteSupervisorEvent`, `createSupervisorEvent`, `joinSession`; all imports from legacy calendar service removed.
- **`app/add-event.tsx`** — replaced legacy `createEvent` with `createSpecialEvent` from `calendarService.ts`.
- **OAuth scope in `context/auth.tsx`** — corrected from `drive.file` to `calendar.events`.
- **Supervisor event detection** — `isSupervisorEvent()` helper added to `home.tsx`, `calendar.tsx`, and `timeline-view.tsx`; matches both `(sup)` (current format) and `(super)` (legacy format) so old events are not invisible to gym-status logic.

### Fixed
- Supervisor events were invisible to the gym open/closed status card and `hasSupervisor` calendar logic because detection compared `.includes('super')` against titles using `(sup)` — now both formats are matched.
- `edit-session.tsx` had a runtime syntax error (`user?.name ?? ''` combined with `||` without parens) — fixed.

### Removed
- **`services/calendar.ts`** — legacy calendar service fully retired; all callers migrated to `calendarService.ts`.

### Known Issues
- No explicit gym close mechanism — status times out after 2 hours.
- Waiver has no version tracking.
- Admin refresh token is bound to the Desktop OAuth client that issued it — if that client is deleted in Google Cloud Console the token is invalidated; re-run `scripts/get-admin-token.js` with a new Desktop client to recover.
