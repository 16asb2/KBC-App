# KBC Web App — Claude Code Guide

New installable web app (PWA) for Kingston Boulder Cooperative, replacing the Expo/React Native app in `../mobile/`. See [../WEB-MIGRATION-PLAN.md](../WEB-MIGRATION-PLAN.md) for the phased migration plan this app is being built against, and [../CLAUDE.md](../CLAUDE.md) for the shared backend (Firebase project, Cloud Functions, Firestore rules) this app talks to.

## Status

Phases 1-4 are done — domain layer, auth + shell, all four Phase 3 workflows, member directory, admin management, and read-only calendar views. Phase 6 (PWA/install experience) is mostly done: manifest, service worker, icons, install prompts — still needs an actual on-device install check, which isn't possible from this environment. Phase 7 (security remediation) is done — see git log. Phase 5 (Stripe payments) is out of scope for this version of the app. Phase 8 (deploy/CI): `firebase.json`/`.firebaserc` and `.github/workflows/deploy-web.yml` are in place and the `FIREBASE_SERVICE_ACCOUNT_KBC_APP_3307B` secret now exists — deploys should be live on PRs going forward. All six tabs now have real content, including Boulders (KBC mode) and Log Book, ported outside the original 8-phase scope for full feature parity with mobile. Deferred: Boulders' Personal mode (separate self-contained data model), a handful of narrower supervisor conveniences from Phase 3, and the boulder-summary/climb-summary stats screens. See git log for exact scope per commit. This file will grow as further gaps get closed.

## Tech stack

- **Vite** + **React 19** + **TypeScript**
- **Tailwind CSS v4** via `@tailwindcss/vite` (no separate PostCSS config needed — see `vite.config.ts`)
- **ESLint** (flat config, `eslint.config.js`) + **Prettier** (`.prettierrc.json`) — `npm run lint`
- **Vitest** for unit tests — colocated `*.test.ts` files
- Firebase: this app is free to use the real **modular Firebase JS SDK** (`firebase` package) directly, unlike `mobile/`, which is REST-only because the Firebase SDK is incompatible with React Native's New Architecture. That constraint doesn't apply here.
- `@/*` path alias → `src/*` (configured in both `vite.config.ts` and `tsconfig.app.json`), matching `mobile/`'s convention.

## Environment

`.env.example` lists the required config: Firebase web config keys (`VITE_FIREBASE_*`) and `VITE_SUPER_ADMIN_EMAIL`. All of these are public by design — safe to ship in the browser bundle. **Never** put admin OAuth credentials, client secrets, or refresh tokens in a `VITE_*` variable; those stay server-side in `functions/` (Secret Manager).

## Source layout

```
src/
  types/member.ts     — UserProfile, MembershipStatus, WaiverRecord, EmergencyContact
                         (ported from mobile/services/firestore.ts — keep in sync,
                         the `users/{uid}` Firestore collection is shared)
  domain/
    membership.ts      — nextMembershipStatus(): pure auto-transition decision logic
    roles.ts            — isAdminFor()/isAdmin()/isPrivileged(): role resolution
                          (each has a colocated *.test.ts)
  services/profiles.ts — Firestore CRUD for user profiles, modular SDK
  lib/firebase.ts       — initializeApp()/getAuth()/getFirestore()/googleProvider

  context/
    AuthContext.tsx      — Firebase Auth: user, loading, signInWithGoogle(), signOut()
                          (thin — the modular SDK's onAuthStateChanged/session
                          persistence replaces most of mobile/context/auth.tsx's
                          manual token-caching; that file's Calendar-scope OAuth
                          token handling isn't ported yet, it lands with Phase 4)
    ProfileContext.tsx    — profile, profileLoading, profileReady, reloadProfile
                          (ported from mobile/context/profile.tsx onto services/profiles.ts)
  routes/
    RequireAuth.tsx       — redirects to /login if signed out
    RequireRole.tsx        — generic role gate; pass a check from domain/roles.ts
                            (used to gate /members on isPrivileged)
    OnboardingGate.tsx      — mirrors mobile/app/_layout.tsx's RootLayoutNav cascade:
                            no profile/legalName → /setup; no waiverMembership →
                            /waiver/membership; no waiverLiability → /waiver/liability
  layout/
    AppShell.tsx           — header + responsive nav (sidebar ≥md, bottom bar <md)
    nav.ts                  — NAV_ITEMS: mirrors mobile/'s TABS order + KBC colors
  pages/                    — one file per route. All placeholders except LoginPage
                            (real Google sign-in) — page content is Phase 3/4 work.
                            NewMemberSetupPage and WaiverPage are the real
                            mobile/app/new-member-setup.tsx and
                            mobile/app/waiver/[type].tsx workflows, not yet built.
  App.tsx                   — route tree: /login, then RequireAuth → OnboardingGate
                            → (/setup, /waiver/:type) or AppShell → tab routes
```

**Cross-app compatibility constraint:** `services/profiles.ts` writes to the same `users/{uid}` documents `mobile/`'s REST client reads. Fields like `emergencyContact` are stored as JSON-*stringified* strings, not native Firestore maps — `mobile/`'s hand-rolled REST decoder only understands `stringValue`/`booleanValue`/`integerValue`/`timestampValue` and silently returns `null` for a `mapValue`/`arrayValue`. Keep writing `JSON.stringify(...)` for those fields; don't "clean up" to native nested objects while both apps read the same collection.

**Pure-logic-first pattern**: domain functions that make a decision (`nextMembershipStatus`, `isAdminFor`) take their inputs as plain parameters and return a value — no Firestore/env reads inside them, so no mocking is needed to unit test them. Side-effecting wrappers (env var reads, Firestore writes) live one layer up, in `domain/roles.ts`'s `isAdmin()`/`SUPER_ADMIN_EMAIL` and `services/profiles.ts`'s `checkAndUpdateMembershipStatus()`. Follow this split for new domain logic (session rules, punch-pass logic, etc. in later phases).

## Commands

```bash
npm run dev      # dev server
npm run build    # tsc -b && vite build
npm run lint     # eslint .
npm run test     # vitest run
npm run preview  # preview a production build
```
