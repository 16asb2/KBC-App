# Changelog

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
