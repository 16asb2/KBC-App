# KBC App — Migration Plan: Expo/React Native → Installable Web App (PWA)

**Repo:** `16asb2/KBC-App`
**Status:** Planning — not yet started
**Author:** Artur (KBC mobile app developer)
**Purpose of this doc:** Hand to Claude Code as the working spec for the migration. Update as decisions are made.

---

## 1. Why we're migrating

The Apple Developer Program enrollment for KBC (org account + nonprofit fee waiver) is an open-ended blocker. The features that genuinely required a native runtime have been deprioritised:

- Stripe Terminal with **Bluetooth** readers — deprioritised
- BLE beacon auto check-in — deprioritised (future idea only)
- Native push notifications — deprioritised

With those off the table, nothing in the app's core feature set requires a native binary. A web app deployed to Firebase Hosting removes the App Store dependency entirely, ships updates instantly, and installs to a phone home screen via "Add to Home Screen."

---

## 2. Decision: rebuild fresh, don't use Expo Web

**Recommendation: build a new web app from scratch in the same repo, porting logic (not UI) from the Expo project.**

Expo's web target (`react-native-web`) was considered and rejected for these reasons:

| Issue | Impact |
|---|---|
| Expo dropped first-class PWA/service-worker tooling (`expo-pwa` deprecated) | The single most important capability for this project would need manual bolt-on anyway |
| `react-native-web` renders div-soup, not semantic HTML | Worse accessibility, worse browser defaults, awkward text selection and scroll behaviour |
| `@stripe/stripe-react-native` has no web support | Payments must be rewritten for Stripe.js regardless |
| `@react-native-google-signin` is native-only | Auth must be rewritten for `signInWithPopup` regardless |
| RN `StyleSheet` subset vs real CSS | No media queries, no CSS grid, fights against responsive web layout |

Since **auth and payments — the two hardest integrations — have to be rewritten either way**, the remaining benefit of Expo Web is only screen-component reuse, and those components carry a permanent tax. Clean break is the better trade.

**What we keep 100% unchanged:** Firebase project, Firestore data model, Cloud Functions, `firestore.rules`, the mediated Google Calendar architecture, the role hierarchy design, DESIGN.md decisions.

---

## 3. Target stack

| Layer | Choice | Notes |
|---|---|---|
| Build tool | Vite | Fast, first-class PWA plugin |
| Framework | React 18 + TypeScript | Matches existing skills |
| Routing | React Router v6 | File-free, explicit route config |
| Styling | Tailwind CSS | Fast responsive work, mobile-first |
| Backend SDK | Firebase JS SDK (modular v10+) | Firestore, Auth, Functions callable |
| Auth | Firebase Auth `signInWithPopup` + `GoogleAuthProvider` | Replaces native Google Sign-In |
| Payments | `@stripe/stripe-js` + `@stripe/react-stripe-js` | Stripe Checkout preferred over Elements for MVP |
| PWA | `vite-plugin-pwa` (Workbox) | Manifest, service worker, offline shell |
| Hosting | Firebase Hosting | Same project, keeps auth domain consistent |
| CI | Existing GitHub Actions | Extend `lint-and-test` to the web workspace |

**Repo layout — keep one repo:**

```
KBC-App/
├── mobile/          # existing Expo app — move here, keep, do not delete yet
├── web/             # NEW — Vite + React web app
├── functions/       # shared Cloud Functions (unchanged)
├── firestore.rules  # shared (unchanged, but hardened — see Phase 7)
├── DESIGN.md
├── CHANGELOG.md
└── CLAUDE.md        # update with web/ context
```

Keeping `mobile/` in place costs nothing and preserves the option to resurrect Stripe Terminal / BLE later.

---

## 4. Phased plan

### Phase 0 — Scaffolding
- Branch: `feat/web-app-scaffold`
- Move existing Expo app into `mobile/`; verify it still builds
- Scaffold `web/` with Vite + React + TS
- Add Tailwind, ESLint, Prettier matching existing mobile config
- Add `web/.env.example` — **Firebase web config keys only** (these are public by design; no admin/OAuth secrets, ever)
- Verify: dev server runs, blank app renders

### Phase 1 — Domain layer port
The most valuable carry-over. This is plain TypeScript, framework-agnostic.
- Port Firestore type definitions / interfaces (members, sessions, passes, waivers, roles)
- Port membership status logic (Active / Inactive / Non-member)
- Port role-resolution logic (super-admin, admin, supervisor, member)
- Port Firestore query/mutation helpers, rewritten against the modular Firebase JS SDK
- Unit tests for status and role logic — these should exist before any UI

### Phase 2 — Auth + app shell
- Firebase Auth init, `signInWithPopup` with Google provider
- Auth context/provider with loading state
- Protected route wrapper; role-gated route wrapper
- App shell: responsive layout, bottom nav on mobile / sidebar on desktop
- New-user path: create Firestore user doc with `Non-member` default status

### Phase 3 — Core member flows
Rebuild the four documented workflows, in this order:
1. **App entrance** — membership check + waiver check gate
2. **Session sign-in** — the daily-driver flow, most important to get right
3. **Purchase access pass** — UI only in this phase; wire to Stripe in Phase 5
4. **Add new member via supervisor account**

Each flow should match the existing workflow diagrams. Flag any divergence in DESIGN.md rather than silently changing behaviour.

### Phase 4 — Admin & supervisor
- Member directory (supervisor: read-only; admin: full)
- Admin management screen (dynamic Firestore-managed admins)
- Calendar views — read via the existing mediated Cloud Function, never calling the Calendar API from the browser

### Phase 5 — Payments (out of scope for this version)
**Dropped from this version of the app.** Purchase-access (Phase 3) already ships as UI-only — a member picks an option and it writes `pending` status / `pendingPunches` for admin confirmation, exactly matching mobile's current (non-Stripe) behavior. Real payment processing was never live in mobile either, so this isn't a regression. If Stripe integration becomes a priority later, the original plan was:
- Stripe Checkout Session created by a Cloud Function, redirect from web
- Webhook handler in `functions/` for fulfilment (grant pass / activate membership)
- Success and cancel return routes
- Recurring membership billing via Stripe Subscriptions

> **Note on in-person payments:** Stripe Terminal's **JavaScript** SDK supports internet-connected smart readers (e.g. WisePOS E / Stripe Reader S700) over the network, unlike the Bluetooth-only readers that need the native SDK. If front-desk card payments come back as a requirement, this is the path — verify current hardware support against Stripe's docs before committing to a reader purchase.

### Phase 6 — PWA & install experience
- `manifest.webmanifest`: name, short name, theme colour, icons (192/512 + maskable)
- Service worker via `vite-plugin-pwa`, `registerType: 'autoUpdate'`
- Offline fallback page; cache the app shell, never cache Firestore auth state
- **iOS install onboarding**: a dismissible in-app card with illustrated Share → Add to Home Screen steps. iOS gives no install prompt API, so this is the whole conversion funnel — do not skip it.
- Android/desktop: handle `beforeinstallprompt` for a real install button
- Test: launches standalone (no browser chrome), correct icon, correct splash

### Phase 7 — Security remediation ✅ done
Checked each item against the actual code/rules rather than assuming the list was still accurate — most of it already held:
- **Critical:** `firestore.rules` locked down, not in test mode — ✅ confirmed, no wildcard-open rules. (Rules tests still not written — the rules themselves just turned out to already be sound.)
- **Critical:** admin OAuth credentials live only in Cloud Function config — ✅ confirmed, `functions/src/index.ts` uses `defineSecret()`/Secret Manager, nothing in any client bundle.
- **Medium:** server-side role enforcement — ✅ effectively already true. `isSupervisorOrAdmin()` in `firestore.rules` re-reads the live `users/{uid}` doc server-side rather than trusting anything client-supplied, so it isn't spoofable. Migrating to Firebase Auth **custom claims** would still be a reasonable *performance* upgrade (a JWT claim read vs. an extra Firestore `get()` per rule check) but isn't closing a security gap — downgraded from a fix to an optional later optimization.
- **Medium:** migrate hardcoded super-admin off a personal account — ✅ already the case. The hardcoded super-admin is `kingstonboulderingcooperative@gmail.com`, the KBC org account (also the account the Firebase project itself is managed under), not a personal one.
- **Medium:** add secret scanning to CI — ✅ confirmed, `gitleaks-action` already runs in `.github/workflows/ci.yml`.
- **Low:** replace timestamp-based user IDs — the actual bug this pointed at: `findOrLinkProfile()` linked a manually-created member's synthetic `manual_<timestamp>_<random>` doc to their real Firebase UID but never deleted the old doc, leaving a permanent orphan. **Fixed** — see git log (`fix(web): delete the superseded doc when linking a manual profile`). Full replacement of the synthetic-ID scheme itself (pre-provisioning a real UID via a Cloud Function) is still open but low-value now that the orphan bug is gone.

### Phase 8 — Deploy & CI
- Firebase Hosting config; add authorised domain to Firebase Auth settings
- GitHub Actions: build + lint + test `web/` on PR; deploy to Hosting preview channel on PR, live on merge to main
- Re-add `lint-and-test` as a required status check on the "Protect main" ruleset once green
- Update `CLAUDE.md`, `DESIGN.md`, `CHANGELOG.md`

---

## 5. Working conventions (unchanged)

- Typed branches off main: `feat/`, `fix/`, `chore/`, `refactor/`
- Conventional commit prefixes
- Architecture decisions recorded in `DESIGN.md`; versioning in `CHANGELOG.md`
- Secrets never in Git; `.env` managed manually via the OneDrive vault

---

## 6. Open questions to resolve during the build

- Punch pass vs. membership model (carried over from DESIGN.md — still open)
- Gym close mechanism (carried over from DESIGN.md — still open)
- ~~Do we keep the Expo app alive as a build target, or freeze `mobile/` at its current commit?~~ Resolved during Phase 0: freeze `mobile/` at its current commit once `web/` reaches parity.
- Session check-in method on web: QR scan via `getUserMedia` (works in iOS Safari), manual code entry, or both?
- Does anything currently depend on Firebase App Distribution / the `kbc-friends` tester group that needs a web equivalent (e.g. a staging Hosting channel)?

---

## 7. Definition of done for MVP

- A climber can open a link on iOS or Android, sign in with Google, add the app to their home screen, and sign in to a session
- A supervisor can add a new member and view the member directory
- An admin can manage admins and view the schedule
- A member can select and "purchase" an access pass, same as mobile today: it's recorded as `pending` for admin confirmation, no real payment processing (Stripe is out of scope for this version — see Phase 5)
- Firestore rules are locked down (rules tests still not written)
- No App Store or Play Store dependency anywhere in the path
