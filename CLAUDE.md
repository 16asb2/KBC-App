# KBC App — Repo Guide

This repo hosts **Kingston Boulder Cooperative (KBC)**'s member app, mid-migration from a native Expo/React Native app to an installable web app (PWA). See [WEB-MIGRATION-PLAN.md](./WEB-MIGRATION-PLAN.md) for the full migration plan and rationale.

## Layout

```
mobile/       — Existing Expo/React Native app. Frozen at feature-parity: no new
                feature work here once web/ catches up. See mobile/CLAUDE.md.
web/          — New Vite + React + TypeScript PWA. Active development target.
                See web/CLAUDE.md.
admin-web/    — Legacy standalone admin panel (single HTML file, Firebase Hosting
                site `kbc-app-admin`). Slated for retirement once web/'s admin
                screens (migration Phase 4) reach parity with it.
functions/    — Firebase Cloud Functions source. Contains getAdminCalendarToken,
                but **this has never been deployed** — the Cloud Functions API
                isn't even enabled on the project. Don't assume it's running;
                worker/ below is what actually serves that endpoint.
worker/       — Cloudflare Worker (`kbc-admin-token`). **This is the live
                admin-token service**, despite the env var that points at it
                being named *_CLOUD_FUNCTIONS_BASE_URL in both apps. It mediates
                Google Calendar access through the KBC admin account without
                exposing its OAuth credentials to any client. Accepts either a
                Google OAuth access token (mobile/) or a Firebase ID token
                (web/) as proof the caller is a signed-in user.
firestore.rules — Shared Firestore security rules for the whole project.
DESIGN.md     — Product/architecture decisions and open questions (role
                hierarchy, punch-pass vs. membership model, etc.) — these are
                shared across mobile/ and web/, not mobile-specific.
CHANGELOG.md  — Project-wide history.
```

## Shared backend (unchanged by the migration)

- **Firebase project**: `kbc-app-3307b` (see `.firebaserc`)
- **Firestore data model and security rules are shared** between `mobile/` and `web/` — do not fork them per-platform
- **Google Calendar access is always mediated** through the `worker/` Cloudflare Worker (a signed-in user's credential in, a short-lived Calendar access token for the KBC admin account out) — never embed the KBC admin account's OAuth client secret or refresh token in any client bundle, mobile or web
  - ⚠️ **Known issue**: `mobile/.env` currently carries `EXPO_PUBLIC_GOOGLE_ADMIN_REFRESH_TOKEN`, which Expo bakes into every shipped build — a long-lived admin credential sitting in the app bundle. It should be removed once mobile also routes purely through the Worker; `web/` never receives it.

## Working conventions

- Typed branches off `main`: `feat/`, `fix/`, `chore/`, `refactor/`
- Conventional commit prefixes
- Architecture decisions go in `DESIGN.md`; versioning in `CHANGELOG.md`
- Secrets never in Git; `.env` files are gitignored per-app (`mobile/.env`, `web/.env`)
