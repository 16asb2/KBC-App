# KBC App — Repo Guide

This repo hosts **Kingston Boulder Cooperative (KBC)**'s member app. The product is a **web app (PWA)** — that's the only client that will ship. See [WEB-MIGRATION-PLAN.md](./WEB-MIGRATION-PLAN.md) for how it got here.

**The Expo/React Native app in `mobile/` was never released** — not to the App Store, not to Google Play, not to testers in any lasting way. It has no users and never did. Treat it as a reference implementation to port *from*, not as a shipped product with a userbase to protect. That materially changes the calculus on anything touching it: there is no migration/compatibility burden, no "don't break existing installs", no need to keep the two clients behaviourally identical.

## Layout

```
web/          — Vite + React + TypeScript PWA. **The product.** All feature
                work happens here. See web/CLAUDE.md.
mobile/       — Unreleased Expo/React Native app. Kept as a porting reference
                while web/ closes the last feature gaps; safe to delete once
                those are done. Not deployed anywhere. See mobile/CLAUDE.md.
admin-web/    — Legacy standalone admin panel (single HTML file, Firebase
                Hosting site `kbc-app-admin`). This one *is* live. Slated for
                retirement once web/'s admin screens fully cover it.
worker/       — Cloudflare Worker (`kbc-admin-token`). The live admin-token
                service, despite the env var pointing at it being named
                *_CLOUD_FUNCTIONS_BASE_URL. Mediates Google Calendar access
                through the KBC admin account without exposing its OAuth
                credentials to any client. Accepts either a Google OAuth
                access token (mobile/) or a Firebase ID token (web/).
firestore.rules — Shared Firestore security rules.
DESIGN.md     — Product/architecture decisions and open questions (role
                hierarchy, punch-pass vs. membership model, etc.).
CHANGELOG.md  — Project-wide history.
.gitleaks.toml — Secret-scanning config; documents why the public Firebase
                web API key is allowlisted.
```

> There is no `functions/` directory. A Firebase Cloud Function
> (`getAdminCalendarToken`) existed in source but was **never deployed** — the
> Cloud Functions API isn't even enabled on the project — while `worker/`
> quietly served that endpoint the whole time. It was deleted rather than left
> as a decoy; recover from git history if ever needed.

## Backend

- **Firebase project**: `kbc-app-3307b` (see `.firebaserc`)
- **Firestore data model and security rules** are shared by `web/`, `admin-web/`, and (nominally) `mobile/` — `firestore.rules` is the single source of truth for access control, and client-side role checks are UX only
- **Google Calendar access is always mediated** through the `worker/` Cloudflare Worker (a signed-in user's credential in, a short-lived Calendar access token for the KBC admin account out) — never embed the KBC admin account's OAuth client secret or refresh token in any client bundle

## Working conventions

- Typed branches off `main`: `feat/`, `fix/`, `chore/`, `refactor/`
- Conventional commit prefixes
- Architecture decisions go in `DESIGN.md`; versioning in `CHANGELOG.md`
- Secrets never in Git; `.env` files are gitignored per-app (`web/.env`, `mobile/.env`)
