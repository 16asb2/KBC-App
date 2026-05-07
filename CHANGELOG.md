# Changelog

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
