# KBC Web App — Claude Code Guide

New installable web app (PWA) for Kingston Boulder Cooperative, replacing the Expo/React Native app in `../mobile/`. See [../WEB-MIGRATION-PLAN.md](../WEB-MIGRATION-PLAN.md) for the phased migration plan this app is being built against, and [../CLAUDE.md](../CLAUDE.md) for the shared backend (Firebase project, Cloud Functions, Firestore rules) this app talks to.

## Status

Phase 1 (domain layer) done — no UI wiring yet, no auth, no routes. This file will grow as each phase lands.

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
  lib/firebase.ts       — initializeApp()/getAuth()/getFirestore() client init
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
