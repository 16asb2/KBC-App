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
                credentials to any client. Accepts a Firebase ID token and
                nothing else — it used to also take a Google OAuth access
                token, which any Google user could supply, so that path was
                removed rather than repaired.
firestore.rules — Shared Firestore security rules.
rules-tests/  — Security-rules tests for firestore.rules, run against the
                Firestore emulator. Its own package because the emulator is a
                JVM app: without Java installed these can't run, and they'd
                otherwise break `npm test` in web/ for anyone lacking a JDK.
                CI runs them (`rules-test` job); locally use
                `npm run test:emulated`.
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
- **Google Calendar access is always mediated** through the `worker/` Cloudflare Worker (a signed-in user's credential in, a short-lived Calendar access token for the KBC admin account out) — never embed the KBC admin account's OAuth client secret or refresh token in any client bundle. That token carries `calendar.events`, so it can write: who may create or delete a session is enforced in `web/src/services/calendar.ts`, client-side only. See the open question in `DESIGN.md` about moving writes behind the Worker.

## Working conventions

- Typed branches off `main`: `feat/`, `fix/`, `chore/`, `refactor/`
- Conventional commit prefixes
- Architecture decisions go in `DESIGN.md`; versioning in `CHANGELOG.md`
- CI (`.github/workflows/ci.yml`) runs four jobs: secret scanning, `web/`
  lint+test+build, `worker/` typecheck+test, and the `firestore.rules`
  tests. The worker job pins Node 24 — its tests import a `.ts` file and
  rely on type stripping, which Node 20 doesn't have.
- Two deploy workflows, one per hosting site, because the two share nothing
  but the Firebase project: `deploy-web.yml` builds and ships `web/` to the
  `web` target, `deploy-admin.yml` ships the static `admin-web/` to the
  `admin` target. Each is path-filtered to its own directory. Before the
  second existed, `admin-web/` had no automation at all and a change to it
  merged green while the live panel stayed as it was — so `deploy-admin.yml`
  also parses the panel's single inline `<script>` and refuses to deploy a
  file that cannot load, there being no bundler or test run to catch it.
- Secrets never in Git; `web/.env` is gitignored (see `web/.env.example`)
