# KBC Web App — Claude Code Guide

**The** KBC member app — an installable PWA, and the only client. See [../WEB-MIGRATION-PLAN.md](../WEB-MIGRATION-PLAN.md) for how this app came to be, and [../CLAUDE.md](../CLAUDE.md) for the shared backend it talks to.

> **About the `// Ported from mobile@1cdfada/...` comments throughout this
> source:** they're accurate provenance, but `mobile/` no longer exists — it was
> an unreleased Expo app, deleted once this app covered the ground that
> mattered. The `@1cdfada` is the last commit that still contained it, and it
> reads as a command: `mobile@1cdfada/components/timeline-view.tsx` is
> `git show 1cdfada:mobile/components/timeline-view.tsx`. A bare `mobile/` with
> no path after it refers to the old app in general, not a file.
>
> Nothing there is a live constraint; where this app deliberately diverged,
> that's noted inline.

## Status

Phases 1-4 are done — domain layer, auth + shell, all four Phase 3 workflows, member directory, admin management, and read-only calendar views. Phase 6 (PWA/install experience) is mostly done: manifest, service worker, icons, install prompts — still needs an actual on-device install check. Phase 7 (security remediation) is done. Phase 5 (Stripe payments) is out of scope for this version. Phase 8 (deploy/CI) is wired up and deploying to PR preview channels.

All six tabs have real content: Home, Schedule, Calendar, Members, Boulders (KBC mode), Log Book.

**Remaining feature gaps.** These were originally deferred as "mobile has it, web doesn't" — but since mobile never shipped and is now gone, they are simply *missing features of the product*, not parity debt. Each can still be read out of git history at `1cdfada` if you want the original implementation as a starting point.

The Home screen's supervisor conveniences are no longer among them — adding a new member, signing in an existing other climber, and punch donation are all ported. Punch donation is supervisor-only *by necessity* rather than by choice: it writes to two members' profiles, and `firestore.rules` permits a `users/{uid}` update only for yourself or as a supervisor, so a member attempting it would have the write rejected.

- **Boulders → Personal mode**: logging climbs at non-KBC locations/problems. Self-contained (`personalProblems`, `climbLocations` collections); needs its own list/card/editor UI.
- **Session fulfilment**: a supervisor can open a session and members can
  request one, but mobile's `fulfillSessionRequest` — a supervisor adopting an
  existing member request as their own slot — is not ported. Today they open a
  session over the same time, and reconciliation trims the request away, which
  reaches the same end state by a longer route.

See git log for exact scope per commit.

## Tech stack

- **Vite** + **React 19** + **TypeScript**
- **Tailwind CSS v4** via `@tailwindcss/vite` (no separate PostCSS config needed — see `vite.config.ts`)
- **ESLint** (flat config, `eslint.config.js`) + **Prettier** (`.prettierrc.json`) — `npm run lint`
- **Vitest** for unit tests — colocated `*.test.ts` files
- Firebase: uses the real **modular Firebase JS SDK** (`firebase` package). (The old Expo app couldn't — the SDK is incompatible with React Native's New Architecture — so it hand-rolled a Firestore REST client. That constraint never applied here.)
- `@/*` path alias → `src/*` (configured in both `vite.config.ts` and `tsconfig.app.json`)

## Environment

`.env.example` lists the required config: Firebase web config keys (`VITE_FIREBASE_*`) and `VITE_SUPER_ADMIN_EMAIL`. All of these are public by design — safe to ship in the browser bundle. **Never** put admin OAuth credentials, client secrets, or refresh tokens in a `VITE_*` variable; those stay server-side in `functions/` (Secret Manager).

## Source layout

```
src/
  App.tsx        — route tree: /login, then RequireAuth → OnboardingGate →
                   (/setup, /waiver/:type) or AppShell → the six tab routes
  lib/firebase.ts — initializeApp()/getAuth()/getFirestore()/googleProvider

  types/member.ts — UserProfile, AccessPassId, WaiverRecord, EmergencyContact

  domain/        — pure logic, no Firestore/env reads. Each has a *.test.ts.
    membership.ts       — nextAccessPass(): lapsed-pass decision
    memberProfile.ts    — what a finished member record is, whether its owner
                          has confirmed it, and which pre-registered record a
                          member may claim by legal name
    membershipPass.ts   — PASS_OPTIONS, accessPassLabel(), isDatedPass(),
                          membershipGrantsEntry(), passFromDates()
    roles.ts            — isAdminFor()/isAdmin()/isPrivileged()
    signIn.ts           — hasSignedInToday(), passLabel()
    calendarEvent.ts    — event classification, timeline layout, gym-status-from-events
    climbAggregates.ts  — computeAggregates(), getPersonalStatus()
    boulderFilters.ts   — boulder filter state (+ localStorage persistence)
    climbLogFilter.ts   — climb filter/sort/date-grouping
    signInBook.ts       — sign-in book filtering, day grouping, and the
                          lastSignInAt reset rule
    calendarSession.ts  — session rosters (participants ↔ event title) and the
                          interval maths behind request reconciliation

  services/      — Firestore + Calendar I/O (modular Firebase SDK)
    profiles.ts, logbook.ts, boulders.ts, climblog.ts, calendar.ts

  context/
    AuthContext.tsx     — user, loading, signInWithGoogle(), signOut()
    ProfileContext.tsx  — profile, profileReady, reloadProfile()
    ScheduleContext.tsx — shared calendar-events cache (wraps the AppShell routes)

  routes/
    RequireAuth.tsx     — redirects to /login if signed out
    RequireRole.tsx     — generic role gate; takes a check from domain/roles.ts
    OnboardingGate.tsx  — needsProfileReview → /setup (no profile, a gap in one,
                          or an imported record its owner has never confirmed);
                          missing waivers → /waiver/:type; else render the app

  layout/AppShell.tsx, layout/nav.ts — header + responsive nav (sidebar ≥md,
                                        bottom bar <md); NAV_ITEMS + tab colors

  hooks/         — useSwipe.ts (horizontal swipe for Schedule/Calendar; mobile
                   got this from react-native-gesture-handler)

  pages/         — one per route: Login, NewMemberSetup, Waiver, Home, Schedule,
                   Calendar, Members, AdminManagement, Boulders, ClimbLog,
                   Logbook (the gym sign-in book — distinct from ClimbLog, which
                   is the "Log Book" tab and holds a member's own climbs)
  components/    — shared UI + the modals each page opens (Modal, BadgeIcon,
                   GradeBar, EffortBar, StarRating, DropdownPicker, InstallPrompt,
                   GymMap (the floor-plan wall picker), and the
                   Boulder*/Climb*/Member*/Profile*/Access/NewMember/Season ones)
  utils/         — id.ts (generateId), imageResize.ts (canvas resize → data URL)
```

**The access pass is two fields, not a status.** `users/{uid}` carries
`membershipAccessPass` (`'annual' | '8month' | '4month' | '1month' | 'punch' |
'dropin' | 'none'`) and `membershipConfirmed` (boolean, `false` while a
member's own purchase awaits an admin). These replaced a single
`membershipStatus` field holding `active | pending | inactive`, which conflated
which pass someone bought with whether it had been approved. The pass is
*stored*, not derived from `membershipStart`/`membershipExpiry` — `admin-web/`
keeps an identical copy of the ids and labels, and `firestore.rules` gates
`membershipConfirmed` specifically, so all three have to move together.

**Data-format constraint — keep `JSON.stringify()` on nested `users/{uid}` fields.** `emergencyContact`, `additionalEmails` and `pendingMembership` are stored as JSON-*stringified strings*, not native Firestore maps. This originated as a workaround for the old Expo app's hand-rolled REST decoder, which is now gone — but it still binds, for two reasons that aren't going away:

1. **`admin-web/` reads them the same way** (`JSON.parse(u.emergencyContact || '{}')`), and it's still live.
2. **Every existing production document is already in that format.** Switching to native maps would silently produce a mixed-format collection, and this app's own readers (`JSON.parse`) would throw on the new-format docs.

Changing it means migrating existing documents *and* updating `admin-web/` in the same change — not a local cleanup. Note this does **not** apply to the `boulders`/`climbLogs`/`climbLocations` collections, which correctly use native maps and arrays throughout.

**Pure-logic-first pattern**: domain functions that make a decision (`nextAccessPass`, `isAdminFor`) take their inputs as plain parameters and return a value — no Firestore/env reads inside them, so no mocking is needed to unit test them. Side-effecting wrappers (env var reads, Firestore writes) live one layer up, in `domain/roles.ts`'s `isAdmin()`/`SUPER_ADMIN_EMAIL` and `services/profiles.ts`'s `checkAndClearLapsedPass()`. Follow this split for new domain logic (session rules, punch-pass logic, etc. in later phases).

## Commands

```bash
npm run dev      # dev server
npm run build    # tsc -b && vite build
npm run lint     # eslint .
npm run test     # vitest run
npm run preview  # preview a production build
```
