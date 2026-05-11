# Changelog

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
