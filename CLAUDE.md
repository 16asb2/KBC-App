# KBC App — Repo Guide

This repo hosts **Kingston Boulder Cooperative (KBC)**'s member app: a **web app (PWA)** in `web/`. That's the only client.

## Layout

```
web/          — Vite + React + TypeScript PWA. **The product.** All feature
                work happens here. See web/CLAUDE.md.
admin-web/    — Legacy standalone admin panel (single HTML file, Firebase
                Hosting site `kbc-app-admin`). Still live. Slated for
                retirement once web/'s admin screens fully cover it.
worker/       — Cloudflare Worker (`kbc-admin-token`). The live admin-token
                service, despite the env var pointing at it being named
                *_CLOUD_FUNCTIONS_BASE_URL. Mediates Google Calendar access
                through the KBC admin account without exposing its OAuth
                credentials to any client. Accepts a Firebase ID token (what
                web/ sends) or a Google OAuth access token (legacy).
firestore.rules — Shared Firestore security rules.
DESIGN.md     — Product/architecture decisions and open questions (role
                hierarchy, punch-pass vs. membership model, etc.).
CHANGELOG.md  — Project-wide history.
.gitleaks.toml — Secret-scanning config; documents why the public Firebase
                web API key is allowlisted.
```

### Two directories that used to exist

Both were deleted rather than left around as decoys. Recover from git history
if ever needed — everything is in the commits, nothing was force-purged.

- **`mobile/`** — an Expo/React Native app that `web/` was ported *from*. It
  **was never released**: no App Store, no Play Store, no lasting tester
  distribution, no users, ever. So it carried no compatibility burden, and
  once `web/` covered the ground it mattered for, keeping it was pure noise.
  Last commit containing it: **`1cdfada`** (e.g. `git show 1cdfada:mobile/app/(tabs)/boulders.tsx`).
  Worth knowing about because `web/`'s source is full of accurate
  `// Ported from mobile/...` provenance comments pointing at paths that no
  longer exist on disk.
- **`functions/`** — a Firebase Cloud Function (`getAdminCalendarToken`) that
  was **never deployed**; the Cloud Functions API isn't even enabled on the
  project, while `worker/` quietly served that endpoint the whole time.

## Backend

- **Firebase project**: `kbc-app-3307b` (see `.firebaserc`)
- **Firestore data model and security rules** are shared by `web/` and `admin-web/` — `firestore.rules` is the single source of truth for access control, and client-side role checks are UX only
- **Google Calendar access is always mediated** through the `worker/` Cloudflare Worker (a signed-in user's credential in, a short-lived Calendar access token for the KBC admin account out) — never embed the KBC admin account's OAuth client secret or refresh token in any client bundle

## Working conventions

- Typed branches off `main`: `feat/`, `fix/`, `chore/`, `refactor/`
- Conventional commit prefixes
- Architecture decisions go in `DESIGN.md`; versioning in `CHANGELOG.md`
- Secrets never in Git; `web/.env` is gitignored (see `web/.env.example`)
