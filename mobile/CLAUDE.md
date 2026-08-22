# KBC Scheduler (mobile) — Claude Code Project Guide

> ## ⚠️ This app is retired and was never released
>
> It never shipped to the App Store, Google Play, or any lasting tester
> distribution — **it has no users and never did.** The product is now the web
> app in [`../web/`](../web/CLAUDE.md); see [../CLAUDE.md](../CLAUDE.md).
>
> This directory is kept only as a **porting reference** while `web/` closes its
> last feature gaps (Boulders' Personal mode, a couple of supervisor
> conveniences, the summary screens). Once those land, it can be deleted.
>
> **Don't build features here.** Don't preserve its behaviour for compatibility's
> sake — there's nothing downstream to be compatible with. Where the docs below
> describe intent or business rules, they're still useful; where they describe
> "how it currently works", that's history, not a constraint.

## What this app is
A React Native / Expo app for **Kingston Boulder Cooperative (KBC)**, a member-run climbing gym. It handles:
- Member sign-in & waiver tracking
- Supervisor-scheduled climb sessions (Google Calendar)
- A member-facing boulder problem database with community voting
- A personal climb logbook (KBC gym + custom locations)
- Member management (admin only)

## Tech stack
- **Expo SDK 54**, New Architecture enabled (`newArchEnabled: true`), React Compiler enabled
- **Expo Router** (file-based routing, typed routes)
- **React Native Gesture Handler** for swipe nav between tabs
- **Google Sign-In** (`@react-native-google-signin/google-signin`) — OAuth via Google
- **Firestore REST API** — NO Firebase SDK (incompatible with New Architecture). All Firestore access uses raw `fetch` against `https://firestore.googleapis.com/v1/...`
- **Google Calendar API** for supervisor schedule management
- Android package: `com.kbcscheduler.app` · EAS project ID: `2a2e15b6-8d54-41da-8a65-905904af9084`

---

## Credentials via environment variables
All secrets live in `.env` (gitignored) and are read via `process.env.EXPO_PUBLIC_*`.
Expo inlines `EXPO_PUBLIC_*` vars at build time — they are baked into the bundle, not read at runtime.

| Variable | Used in |
|----------|---------|
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | `services/firestore.ts`, `services/logbook.ts`, `services/boulders.ts`, `services/climblog.ts` |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | same 4 service files |
| `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | `context/auth.tsx` |
| `EXPO_PUBLIC_GOOGLE_CALENDAR_ID` | `services/calendar.ts` |

**For EAS cloud builds**: add these as EAS Environment Variables in the Expo dashboard — Metro won't read the local `.env` file on EAS build servers.
The EAS project ID (`app.json → extra.eas.projectId`) is a public identifier and stays in `app.json`.

---

## Firestore access pattern
Every service file re-declares the same REST helpers (`encodeVal`, `decodeVal`, `fsPatch`, `fsPost`, `fsQuery`, `fsDelete`). This is intentional — no shared Firestore module, to keep each service self-contained.

### Critical rule: NO `orderBy` with equality filters
Firestore REST requires a **composite index** when combining an equality `where` filter on one field with `orderBy` on a different field. We do not create indexes — **always sort client-side instead**:

```ts
// ✗ WRONG — causes 400 error
{ from: [...], where: { fieldFilter: { field: 'uid', op: 'EQUAL', ... } }, orderBy: [...] }

// ✓ CORRECT — sort after fetch
const docs = await fsQuery({ from: [...], where: ..., limit: 500 });
return docs.map(decode).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
```

### Firestore collections
| Collection | Purpose |
|-----------|---------|
| `members/{uid}` | User profiles (membership status, punch passes, waiver) |
| `logs/{id}` | Sign-in logbook entries |
| `boulders/{id}` | KBC boulder problems (community data) |
| `seasons/{id}` | Boulder seasons |
| `climbLogs/{id}` | Personal climb entries (KBC + custom locations) |
| `climbLocations/{id}` | User-created custom climb locations |
| `gymStatus/current` | Single doc: gym open status (set when supervisor signs in) |

---

## Auth & roles
- **Google Sign-In** → `context/auth.tsx` provides `user`, `signOut`, `getAccessToken`
- **`profile.isSupervisor`** — set in Firestore member doc; supervisors can sign others in, add sessions to calendar, see privileged UI
- **`isAdmin(email)`** — hardcoded list in `constants/admins.ts`; admins get full member management, special event creation

---

## Directory structure

```
app/
  (tabs)/
    _layout.tsx      — Tab bar config + swipe gesture (6 visible tabs)
    home.tsx         — Sign-in book, gym open status, member management
    index.tsx        — Schedule (Google Calendar timeline)
    calendar.tsx     — Month calendar view
    members.tsx      — Member directory (admin/sup only)
    boulders.tsx     — Boulder problem list + voting + logging
    climblog.tsx     — Personal climb logbook
    logbook.tsx      — Sign-In Book (hidden from tab bar, accessed from Home)
  add-session.tsx    — Add/request a climb session
  edit-session.tsx   — Edit existing calendar event
  add-event.tsx      — Add special event (admin)
  climb-summary.tsx  — Bar chart summary of personal climbs
  login.tsx          — Google Sign-In screen
  waiver/            — Waiver signing flow

components/
  badge-icon.tsx     — BADGE_COLOR map, HoldIcon (40 SVG-like View icons), BadgeIcon disk component
  grade-bar.tsx      — KBC 5-color grade bar with PanResponder slider; used in boulders + climblog
  time-picker-modal.tsx — Shared date/time picker modals
  timeline-view.tsx  — Calendar timeline for schedule screen
  toast.tsx          — Ephemeral toast notification

services/
  boulders.ts        — Boulder CRUD, grade/quality/badge voting, community aggregates
  climblog.ts        — PersonalClimb + ClimbLocation CRUD; grade scale arrays (V, Font, YDS, KBC)
  logbook.ts         — Sign-in entries, active climber count, gym open status (gymStatus/current)
  firestore.ts       — Member profiles, waivers
  calendar.ts        — Google Calendar API (events CRUD)
  firebase.ts        — (legacy placeholder, not used for data)

context/
  auth.tsx           — Google auth state + access token
  profile.tsx        — Current user's member profile
  schedule.tsx       — Google Calendar events cache (shared across tabs)

constants/
  admins.ts          — Hardcoded admin email list
  theme.ts           — KBC color palette (KBC.cyan, KBC.pink, KBC.purple, KBC.orange, KBC.lime, KBC.green, KBC.black, KBC.white)
```

---

## Tab navigation
```
TABS array (swipe order):
  0  home       KBC.cyan
  1  index      KBC.pink    (Schedule)
  2  calendar   KBC.purple
  3  members    KBC.orange
  4  boulders   KBC.lime
  5  climblog   KBC.green   (Log Book)

logbook tab: href: null — hidden from bar, route still works; opened via Home button
```

---

## Key shared components

### `BadgeIcon` (`components/badge-icon.tsx`)
```tsx
<BadgeIcon label="Crimps" selected onPress={toggle} size="sm" />
// size: 'xs' (24px, no label) | 'sm' (36px + label) | 'md' (44px + label)
// selected: full opacity; unselected: 40% opacity
```
- `BADGE_COLOR` — 40-entry color map for all badge names
- `HoldIcon` — View-based icon for each badge (40 switch cases)

### `GradeBar` (`components/grade-bar.tsx`)
```tsx
// Interactive (for voting / personal grade selection):
<GradeBar votes={gradeVotes} userUid={uid} onVote={handleVote} interactive />
// Display only (card preview):
<GradeBar votes={boulder.gradeVotes} compact />
// KBC personal grade in climblog (single user, no community):
<GradeBar votes={{ __self: gradeIndex }} userUid="__self" onVote={handleKbcVote} interactive />
```
- Red marker = community average (`avgGrade(votes)`)
- Green marker = current user's vote
- `compact` = 18px height, no labels

### KBC grade system
```ts
// KBC_GRADE_LABELS = ['White', 'Blue', 'Purple', 'Pink', 'Black']
// GRADE_COLORS = [white, blue, purple, pink, black] hex values
// GRADES = same as KBC_GRADE_LABELS (used in boulders.ts)
// Stored as index 0–4 in gradeVotes Record<uid, number>
```

### Grade systems (climblog)
```ts
'kbc'      → KBC_GRADE_LABELS (5 colors)
'v-scale'  → V_SCALE (VB–V17, 19 grades)
'font'     → FONT_SCALE (3–9a, 23 grades)
'yosemite' → YDS_SCALE (5.0–5.15d, 36 grades)
```
Boulder disciplines → v-scale or font (user picks). Roped → yosemite (locked).

---

## Gym open status
- **Source of truth: Firestore `gymStatus/current`** (not the calendar schedule)
- Triggered when a supervisor physically signs in via the logbook
- `setGymOpen(displayName)` in `services/logbook.ts` — writes `openedBy`, `openedAt`, `closesAt` (2h window)
- `getGymStatus()` in `services/logbook.ts` — reads the doc, checks if `closesAt > now`
- Calendar schedule is still used for "next session opens at X" (closed state display)

---

## Patterns & conventions

### Firestore PATCH with field mask
```ts
// Only update specific fields — avoids overwriting other fields on the doc
await fsPatch(`boulders/${id}`, { ascentCount: 5 }, ['ascentCount']);
```

### Personal climb logging (unified collection)
All personal climbs (KBC and custom locations) go to `climbLogs/{id}`:
- `locationId: 'kbc'` for KBC gym climbs
- `locationId: <ClimbLocation.id>` for custom locations
- `boulderId` only set for KBC boulders
- Community aggregates (`gradeVotes`, `qualityVotes`, etc.) stay on the boulder doc — separate concern

### Sign-in logbook
`logs/{id}` — entries created by `addLogEntry()`. ID is derived from timestamp + random suffix.

### Access control in UI
```ts
const isSupervisor = profile?.isSupervisor ?? false;
const isAdminUser  = isAdmin(user?.email);
const isPrivileged = isAdminUser || isSupervisor;
```

---

## Build & test
```bash
# Run on device/emulator
npx expo start

# Android APK for internal testing (installs directly, no store)
eas build --profile preview --platform android

# Production build
eas build --profile production --platform android
eas submit --platform android
```
The `preview` profile produces an APK distributed internally (no Play Store needed).
`production` auto-increments `versionCode`.

**Camera and GPS are not yet implemented** — planned future features. No permissions are declared in `app.json` yet; add them when implementing.
