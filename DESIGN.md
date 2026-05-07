# KBC App — Design Document

## What the app is and who it's for

**KBC Scheduler** is the member app for **Kingston Boulder Cooperative (KBC)**, a member-run climbing gym in Kingston, Ontario. It replaces paper sign-in sheets, a shared Google Calendar, and informal boulder tracking with a single mobile app.

**Users:**
- **Regular members** — sign in to climbing sessions, browse the schedule, log personal climbs, vote on boulders
- **Supervisors** — volunteer members who open the gym; can sign others in, manage the calendar, open the gym
- **Admins** — board members; can manage memberships, grant/revoke supervisor status, create special events

The app is internal-only — not on any public app store. Distributed as an APK via EAS to a small user base (~dozens of members).

---

## Current Version
**v0.1** — May 2026
See [CHANGELOG.md](./CHANGELOG.md) for full history.

---

## Current Feature Status

### ✅ Done

| Feature | Notes |
|---|---|
| Google Sign-In (OAuth) | All access gated behind Google account |
| Member profiles | Stored in Firestore; name, membership type, punch passes, waiver |
| Waiver signing flow | Dynamic waiver per type (`/waiver/[type]`) |
| Sign-in logbook | Home tab; supervisors can sign in any member or punch pass holder |
| Gym open/closed status | Real-time; triggered when a supervisor physically signs in (not calendar-derived) |
| Schedule tab | Timeline view of upcoming sessions from Google Calendar |
| Month calendar view | Visual calendar for browsing sessions |
| Add/edit climb sessions | Supervisors add sessions (tagged as supervisor slot); regular members request sessions |
| Boulder problem database | Community list with grade voting, quality voting, badge tagging |
| Boulder logging from Boulders tab | Logs ascents/attempts; updates community aggregates |
| Personal climb logbook | Unified log for KBC + custom locations, with grade systems, effort, quality, badges |
| Custom climb locations | Users can create indoor/outdoor locations with sectors |
| Climb summary chart | Bar chart of sends vs attempts by grade, with stats pills |
| Member directory | Admin/supervisor only; shows all members |
| Supervisor management | Admins can grant/revoke supervisor status |
| Swipe navigation | Gesture-based swipe between all tabs |
| KBC grade bar | 5-color interactive slider (White → Black) used across boulders + climblog |
| Badge icons | 40 hold-type badges with SVG-style icons, used in boulders + climblog |

### 🔄 In Progress / Planned

| Feature | Status | Notes |
|---|---|---|
| Admin isAdmin via Firestore | Planned | Currently hardcoded in `constants/admins.ts` — baked into APK; next build should move this to Firestore |
| Calendar access management | Planned | Grant/revoke Google Calendar sharing per supervisor from within the app (Google Calendar ACL API) |
| Camera (photo on boulder log) | Future | Not implemented; no permissions declared yet |
| GPS / location auto-fill | Future | Not implemented; no permissions declared yet |
| Push notifications | Future | No backend to trigger them; would require FCM + a server or Cloud Function |
| iOS build | Future | Android-only for now; no Apple Developer account yet |
| Play Store / public distribution | Future | Currently APK-only via EAS preview builds |

---

## Technical Decisions and Rationale

### No Firebase SDK — Firestore via REST
Expo SDK 54 with New Architecture (`newArchEnabled: true`) is incompatible with the Firebase JS SDK. Rather than downgrade or use compatibility shims, we call the Firestore REST API directly with `fetch`. This means:
- Every service file (`boulders.ts`, `climblog.ts`, `logbook.ts`, etc.) re-declares the same small set of REST helpers (`encodeVal`, `decodeVal`, `fsPatch`, `fsPost`, `fsQuery`, `fsDelete`)
- This is intentional duplication — keeps each service self-contained and avoids a shared module that might be hard to debug
- **Critical constraint**: Firestore REST returns a 400 if you combine an equality `where` filter with `orderBy` on a different field without a composite index. We never create indexes — always sort client-side after fetching

### No backend server
The app talks directly to Google's APIs from the device. There is no custom API, no server, no Cloud Functions. This simplifies deployment (no infra to maintain) but means:
- No server-side validation
- No push notifications (no server to send them)
- API keys are hardcoded (acceptable for an internal app with a small, known user base)
- Admin list was originally hardcoded; moving to Firestore in the next build

### Google OAuth for everything
All auth flows through Google Sign-In. The access token from Google is reused for both Firestore (via API key, not token) and the Google Calendar API (token required). Role data (supervisor, admin) is stored in Firestore, not in Google.

### Gym open status — Firestore, not Calendar
An earlier design used the calendar schedule to infer whether the gym was open. This was unreliable (events could be in the past, cancelled, etc.). The current design has a dedicated `gymStatus/current` Firestore document that is written when a supervisor physically signs in. It stores `openedBy`, `openedAt`, and `closesAt` (2-hour window). The calendar is still used to show "next session at X" when closed.

### Unified `climbLogs` collection
Personal climb entries for both KBC boulders and custom locations live in a single flat collection (`climbLogs/{id}`) with a `locationId` field (`'kbc'` or a `ClimbLocation.id`). This avoids subcollections and makes querying all of a user's climbs simple. Community aggregates (grade votes, quality votes, badge votes, ascent/attempt counts) remain on the boulder document — they are a separate concern from the personal log.

### Grade systems
- **KBC grades**: 5 colors (White → Black), stored as vote indices 0–4 in `Record<uid, number>`
- **Personal grades**: V-scale (19 grades), Fontainebleau (23 grades), or YDS (36 grades) depending on discipline; stored as free-text strings
- Boulder discipline → user picks V-scale or Font; roped disciplines → YDS locked
- The `GradeBar` component handles both community voting (multiple user votes → average marker) and personal single-user selection

### View-based icons, no icon library
The `HoldIcon` component in `components/badge-icon.tsx` renders 40 different climbing hold icons using composed `View` elements (circles, rectangles, borders). No SVG library, no image assets. This keeps the bundle small and avoids SVG rendering issues on Android New Architecture.

### Swipe navigation
`react-native-gesture-handler` `Pan` gesture wraps the entire tab layout. Tab order matches a logical gym workflow: Home → Schedule → Calendar → Members → Boulders → Log Book.

---

## Open Questions / Unresolved Decisions

| Question | Context |
|---|---|
| **Move `isAdmin` to Firestore?** | Currently hardcoded in `constants/admins.ts` — can't change without a rebuild. Plan is to add `isAdmin` field to member docs and bootstrap via Firebase Console. Needs to happen before wider distribution. |
| **Calendar ACL management in-app?** | Supervisors currently need the KBC calendar manually shared with their Google account. The Google Calendar ACL API supports granting this programmatically — should be tied to the supervisor toggle in the Members tab. |
| **Punch pass vs membership model** | Both exist but the distinction isn't fully enforced in the UI. What exactly can punch pass holders do vs full members? |
| **Boulder seasons** | A `seasons` collection exists in Firestore but the UI for managing season transitions (archiving old boulders, starting a new season) is not built yet. |
| **Waiver versioning** | The waiver is stored as a flag on the member doc but there's no version tracking. If the waiver text changes, existing members won't be prompted to re-sign. |
| **Camera + GPS** | Planned but no design decision yet on how photos are stored (Firestore is not a good fit for binary blobs — Firebase Storage would be needed). |
| **iOS** | No Apple Developer account, no iOS build profile. Would need a Mac for certain build steps. |
| **What happens when gym closes?** | `gymStatus/current` sets a 2-hour `closesAt` window but there's no mechanism to close early or extend. Supervisors currently can't "close" the gym explicitly — it just times out. |

---

## Architecture at a Glance

```
Device
  └── React Native / Expo (Android)
        ├── Google Sign-In (OAuth 2.0)
        │     └── Access token → Google Calendar API (read/write events)
        ├── Firestore REST API (no SDK)
        │     ├── members/{uid}
        │     ├── logs/{id}           ← sign-in logbook
        │     ├── gymStatus/current   ← live gym open state
        │     ├── boulders/{id}       ← community problem database
        │     ├── seasons/{id}
        │     ├── climbLogs/{id}      ← personal climb history
        │     └── climbLocations/{id} ← user-created locations
        └── (no custom backend)
```
