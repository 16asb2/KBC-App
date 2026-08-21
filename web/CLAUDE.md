# KBC Web App — Claude Code Guide

New installable web app (PWA) for Kingston Boulder Cooperative, replacing the Expo/React Native app in `../mobile/`. See [../WEB-MIGRATION-PLAN.md](../WEB-MIGRATION-PLAN.md) for the phased migration plan this app is being built against, and [../CLAUDE.md](../CLAUDE.md) for the shared backend (Firebase project, Cloud Functions, Firestore rules) this app talks to.

## Status

Phase 0 (scaffolding) only — no feature code yet. This file will grow as each phase lands.

## Tech stack

- **Vite** + **React 19** + **TypeScript**
- **Tailwind CSS v4** via `@tailwindcss/vite` (no separate PostCSS config needed — see `vite.config.ts`)
- **ESLint** (flat config, `eslint.config.js`) + **Prettier** (`.prettierrc.json`) — `npm run lint`
- Firebase: this app is free to use the real **modular Firebase JS SDK** (`firebase` package) directly, unlike `mobile/`, which is REST-only because the Firebase SDK is incompatible with React Native's New Architecture. That constraint doesn't apply here.

## Environment

`.env.example` lists the required Firebase web config keys (`VITE_FIREBASE_*`). These are public by design — safe to ship in the browser bundle. **Never** put admin OAuth credentials, client secrets, or refresh tokens in a `VITE_*` variable; those stay server-side in `functions/` (Secret Manager).

## Commands

```bash
npm run dev      # dev server
npm run build    # tsc -b && vite build
npm run lint      # eslint .
npm run preview  # preview a production build
```
