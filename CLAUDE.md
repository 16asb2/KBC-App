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
functions/    — Firebase Cloud Functions (shared by mobile/ and web/). Currently:
                getAdminCalendarToken, which mediates Google Calendar writes
                through the KBC admin account without exposing its OAuth
                credentials to any client.
worker/       — A Cloudflare Worker that duplicates functions/'s
                getAdminCalendarToken. Not currently called by mobile/ or
                admin-web/ — status unconfirmed, do not assume it's dead without
                checking the Cloudflare dashboard.
firestore.rules — Shared Firestore security rules for the whole project.
DESIGN.md     — Product/architecture decisions and open questions (role
                hierarchy, punch-pass vs. membership model, etc.) — these are
                shared across mobile/ and web/, not mobile-specific.
CHANGELOG.md  — Project-wide history.
```

## Shared backend (unchanged by the migration)

- **Firebase project**: `kbc-app-3307b` (see `.firebaserc`)
- **Firestore data model, security rules, and Cloud Functions are shared** between `mobile/` and `web/` — do not fork them per-platform
- **Google Calendar writes are always mediated** through `functions/getAdminCalendarToken` (a Firebase ID token in, a short-lived Calendar access token out) — never embed the KBC admin account's OAuth client secret or refresh token in any client bundle, mobile or web

## Working conventions

- Typed branches off `main`: `feat/`, `fix/`, `chore/`, `refactor/`
- Conventional commit prefixes
- Architecture decisions go in `DESIGN.md`; versioning in `CHANGELOG.md`
- Secrets never in Git; `.env` files are gitignored per-app (`mobile/.env`, `web/.env`)
