# Changelog

All notable changes to KBC Scheduler are documented here.

---

## [Unreleased] — 2026-08-25

### Added
- **"Connect with KBC" is back on the Home screen.** The Discord, Facebook and Instagram buttons from `mobile@1cdfada/app/(tabs)/home.tsx`, at the same brand colours and the same three destinations, plus the KBC email underneath. The email differs from mobile in what a tap does: mobile opened a `mailto:`, which on a desktop browser hands off to whatever mail client the machine has registered — often none at all — so it now copies the address to the clipboard instead, which is what you wanted anyway when e-transferring a membership. Falls back to the old select-and-`execCommand` path when `navigator.clipboard` is unavailable, as it is on a dev server reached over the LAN by IP.
- **`utils/datetime.ts`**: the one place that turns a date into text, with tests. Nine files had reimplemented these formats and they had drifted — two screens hand-rolled a 12-hour clock (`${h % 12 || 12}:${min} ${ampm}` → "9:05 PM") while the rest asked `Intl` for a 2-digit hour ("09:05 PM"), so the same session read differently on the Schedule and in the Calendar list. Everything now routes through here on the no-leading-zero form. Also folds together the three separate today/tomorrow/yesterday checks — two comparing `toDateString()`, one comparing midnight-normalised timestamps — into `relativeDayLabel()`, and absorbs `isSameDay`, which existed identically in `domain/calendarEvent.ts`.
- **`tint()` / `faintTint()` in `constants/theme.ts`**, replacing `KBC.orange + '22'` written inline in five places. That trailing byte is the alpha channel of an eight-digit hex colour; naming it keeps the intent legible and stops the next caller reaching for a slightly different `'20'`. Two new tokens as well: `KBC.live` (the brighter green of the timeline's current-time line, deliberately not the brand `green`) and `KBC.surface`.

### Added
- **A supervisor can sign in another climber again**, from its own button. "Sign In to a Session" stays what it always was — one tap, signs *you* in, for everybody — and **Sign In Another Climber** sits below it in supervisor orange, visible only to supervisors and admins. Home now reads by audience rather than by kind: two blue buttons every member uses on every visit, and an orange pair underneath that is the supervisor's desk work. Picking a climber opens a searchable member list showing what each could sign in with (active member, pending, punches left, no access), so a lapsed membership is visible before you tap. The whole flow is target-aware from there: the punch-pass prompt, buying an access pass, and the log entry all apply to the climber being signed in rather than to whoever is holding the phone, and the viewer's own profile is only reloaded when the sign-in was actually theirs. Whether an entry lands pending still depends on who is *doing* the sign-in, so a supervisor signing a member in confirms it in the same step. Ported from `mobile@1cdfada/app/(tabs)/home.tsx`; punch donation between members is still the one piece of that screen not carried over.

- **Punch donation between members.** The last unported piece of the old Home screen. "Use Another Member's Punch" appears in the access sheet, opens a picker of members who actually have a punch left, and spends one from their account to sign the climber in — logged on both sides as `Punch Pass (from <name>)` with a note saying how many they have left. Supervisors and admins only, matching `mobile@1cdfada` and, more to the point, `firestore.rules`: a donation writes to two different people's profiles, and `users/{uid}` updates are allowed only for yourself or as a supervisor, so offering this to a member would be offering a write the rules reject.

### Fixed
- **The sign-in book names the pass, never the status.** A membership sign-in was logged as "Active Member", which told a supervisor reading the book nothing about what the member actually holds — and asserted "active" of a purchase still waiting on admin confirmation. Entries now carry the pass itself (`Annual pass`, `4-months pass`, `Student annual pass`…), pending or not; the separate pending flag on the entry is what records the confirmation state. Buying a membership logs the option bought, which also stops the student rate being flattened into the same label as everything else. `passLabel()` was a second copy of `getPassId`'s month-bucketing differing only in capitalisation, and now delegates to `getPassLabel` so the book and the member directory cannot drift. `accessKind()` was widened to keep classifying these as memberships — it matched on the word "member", which the new labels do not contain.

### Changed
- **Short messages appear in the middle of the screen, on a colour that says what happened.** The confirmation after a sign-in, the reason one was refused, the error when a write failed — all of it was a black bar tucked under the header, which on a phone landed above where you were looking and was easy to miss entirely. There is now a shared `Toast` component, centred, and its colour carries the outcome: green for done, KBC pink for a genuine failure, orange for the expected refusals ("already signed in today", "no punches remaining") that are answers rather than faults. Text colour is chosen per background rather than fixed at white, because KBC green and orange are light enough that white on them is 2.4:1 and 3.1:1 — both under WCAG AA at this size — while black clears 6.8:1 on either. The backdrop takes no pointer events so a message never blocks the button beneath it, only the message itself is tappable (to dismiss early), and it sits above modals so an error raised inside one is still visible.
- **Supervisors read member records; admins change them.** The membership panel, the pass/expiry/punch editor, the pending-purchase confirm and cancel actions, and "Edit Full Profile" are all admin-only now — a supervisor still opens a member and sees everything, with a line saying access passes and profiles are read-only and an admin can change them, rather than being left to wonder why the buttons went. Note this is a UI change only: `firestore.rules` still permits `isSupervisorOrAdmin()` to update `users/{uid}`, and it has to keep permitting something, because supervisors legitimately write to other members' documents when signing them in, donating a punch, cancelling a sign-in in the book, and signing a waiver for a member they just created.

- **The boulder edit and log screens opened behind the boulder you opened them from.** Tapping Edit on a boulder appeared to do nothing until you dismissed the overview, at which point the form was revealed underneath. Every modal renders at the same z-index, so the later one in the DOM paints on top — and the overview was written last, below the form and log modals it opens. The overview now renders first, so the two stack above it, and closing one returns you to the boulder rather than to the list.
- **Adding a new member confirms it before moving on.** `NewMemberModal` already had a success screen, but nothing ever showed it: it called `onCreated` in the same breath as setting the message, and Home's handler navigates straight to the liability waiver, so the modal unmounted in the same tick. (Its `setTimeout(onClose, 2000)` was then firing on an unmounted component.) It now holds the created member, shows "*name* was successfully added" with what happens next, and only continues to the waiver when you press the button.

### Changed
- **Signing out now actually lets you sign in as someone else.** `new GoogleAuthProvider()` sets no `prompt`, so a browser with exactly one Google account signed in skips the chooser and hands that account straight back — signing out and back in silently returned you to the account you were trying to leave, which is what made switching accounts on a shared device feel impossible. The provider now asks for `prompt: 'select_account'`, so Google's chooser appears on every sign-in. Reopening the app still keeps you signed in: that half was deliberately left alone after trying it the other way, because dropping the session on every close charged a daily sign-in to every member on their own phone to solve a problem that only bites when somebody deliberately signs out. Persistence is now stated explicitly at `initializeAuth` (IndexedDB, falling back to localStorage — the same pair `getAuth()` would have chosen) rather than left implicit, since a later `setPersistence()` call returns a promise and leaves a window where the SDK is still on its default.
- **`KBC.cyan` is now the logo's blue.** Every blue pixel in `KBC_logo.svg` sits on hue 196° at full saturation, with only brightness varying (it is a traced bitmap, so it shades). The token was `#00b4d8` — hue 190° and much lighter: close enough to look deliberate, far enough never to quite match the mark beside it. It is now `#007dab`, sampled from the logo itself. The darker value also settles a contrast problem rather than creating one: this token is used as text and border colour on white in a dozen places, where the old value was **2.46:1** and failed WCAG AA outright, and is now 4.64:1. White on it as a button background is the same 4.64:1, so the blue buttons on Home take white text, and the two cyan action buttons that had been forced to black text (Join this session, Confirm) are white now as well. This moves every blue in the app — special-event blocks and dots on the Schedule and Calendar, the selected-day pill, the Home tab's nav colour, the boulder and climb-log accents. `GRADE_COLORS` is untouched: it is a grade scale, not the brand.
- **Calendar: past events are in the list too, a month back.** The event list started at today, so a session that had already happened simply vanished from it — even though the month grid still showed a dot on the day. It now shows everything in the cache and opens scrolled to today, so recent sessions are a scroll up rather than gone ("who was supervising last Tuesday?"). The fetch window went from 14 days back to 30 to match. Past days are dimmed: with history and future in one list there is otherwise nothing marking where now is, and dimming costs no vertical space.
- **Calendar: the "Upcoming Events / Tap a day…" heading row is gone**, reclaiming the screen space it took at the top of the list.
- **Home: the social links open reliably from the installed app.** An installed PWA in standalone display mode ignores `target="_blank"` on iOS — the tap does nothing. Instagram and Discord got away with it because their apps claim those URLs as universal links, so the OS intercepts before the browser has to care; Facebook does not reliably claim `/vanity` Page URLs, which is why that was the one that looked broken. The links now try `window.open` first, which does escape a standalone PWA, and fall back to the anchor's own behaviour if it is blocked. The Facebook URL also gained its canonical trailing slash, removing a redirect hop — another place the hand-off to the Facebook app can fall over.
- **Calendar: the page scrolls as well as the list.** The tab was pinned to the viewport with only Upcoming Events scrolling inside it, so the month grid was always on screen taking roughly half the display. The page is now taller than the viewport, so scrolling it slides the grid up and away and hands the display over to the list, which scrolls on by itself from there. The list is sized to just *under* one screen, leaving a strip of calendar that never scrolls off: how much calendar survives at the bottom of the page is exactly viewport minus list height, so sizing the list to a full screen left none of it — every touch then landed on the list, and the page would only move again once the list had been scrolled back through every event to its own top. The strip is always there to drag the page back down. Heights come from `svh`, the *small* viewport height, so mobile browser chrome expanding cannot push the bottom of the list out of reach.
- **Members: the "Manage Admins" button is gone.** Granting and revoking admin is handled in `admin-web/` from now on.
- **Home: the three actions are one stack.** They shared no size, weight or spacing before — a large pink button, then two outlined ones at a different font size, spread on the page's 24px rhythm. They now share a single `HomeAction` component and sit 8px apart. **Sign In to a Session** and **Sign-In Book** are the pair a member uses every visit, so they are adjacent and both in KBC cyan; **Add New Member** is a supervisor tool and keeps orange below them. The cyan buttons take black text rather than white: white on `#00b4d8` is about 2.5:1, under WCAG AA even for large text, while black clears 8:1 — and the join and confirm buttons elsewhere in the app already pair cyan with black.
- **Every screen past the login page is loaded on demand.** The app built as a single 975 kB chunk, so a member opening Home also downloaded the boulder editor, the waiver text, the admin screens and the sign-in book. Route-level `lazy()` brings the entry chunk to 795 kB (240 kB gzipped) with each tab arriving as you reach it; the remainder is mostly the Firebase SDK, which the auth and profile contexts need before anything renders. `LoginPage` stays eager — it is the one screen a signed-out visitor is guaranteed to see, and a spinner in front of the sign-in button costs more than the few kB it saves.
- **`// Ported from mobile/...` comments now carry the commit that still has the file.** 50 citations across 44 files became `mobile@1cdfada/...`, which reads as the command that opens them: `mobile@1cdfada/components/timeline-view.tsx` is `git show 1cdfada:mobile/components/timeline-view.tsx`. A bare `mobile/` with no path after it still means the old app in general, and was left alone. `web/CLAUDE.md` documents the convention.
- **Colours that duplicated the KBC palette now reference it** — `'#4db847'`, `'#f97316'`, `'#00b4d8'` and `'#9b5de5'` written as literals in `BoulderCard`, `ClimbRow`, `BadgeIcon` and `GradeBar`. Deliberately *not* touched: `GRADE_COLORS`, the badge colour table and the `GymMap` wall colours. Those are domain data that happens to overlap the brand palette, and folding them into it would couple a grade scale to a marketing decision.

---

## [Unreleased] — 2026-08-24

### Added
- **Climb sessions and special events are now distinct things.** `domain/calendarEvent.ts` gained `eventKind()`, returning `session`, `request` or `special`. A climb session is recognised by its title format — the roster `buildTitle()` writes, so any ` + `-separated segment ending in `(super)`, which covers both `"Artur (super)"` and multi-supervisor `"Artur (super) + Bea (super)"`. Anything else on the calendar, including events added straight in Google Calendar, is a special event. Only sessions and requests offer Join/Leave; a special event opens to a details-only view saying so. `extendedProperties.private.type` wins over the title when the app wrote it, so classification does not depend on a title nobody has edited yet.
- **Tap an empty stretch of the Schedule timeline to create something there**, as in any desktop calendar. The tapped time is snapped to the quarter hour and seeded into the form. Supervisors and admins get a climbing session, everyone else a session request — the same split the buttons above the timeline already made, now derived from one `defaultCreateKind()` so the two paths cannot disagree. A press that travels more than 8px is treated as a swipe rather than a tap, since swiping to change day still ends in a `click` (nothing scrolls horizontally to suppress it) and would otherwise pop the create form on every day change.
- **Calendar tab: Upcoming Events rows open the event**, using the same detail modal the Schedule uses, so joining or editing no longer means switching tabs to find the same event on a timeline.
- **Calendar tab: the month grid drives the list.** Tapping a day rolls Upcoming Events to that day — or to the next day that has anything on — and tapping the same day again opens it on the Schedule tab, which is already showing it because the first tap set the shared `selectedDate`. The list scrolls independently of the grid above it, so rolling to a day never pushes the month off screen.
- **`domain/calendarPermissions.ts`**: one place answering who may join, edit or delete a given event, with tests. Everyone signed in views everything and joins any climb session; supervisors and admins (every admin counts as a supervisor) create sessions and special events and change anything; everyone else creates and deletes their own session request and nothing more. Ownership reads `createdByUserId`, falling back to the title for the pre-`extendedProperties` events still on the KBC calendar, whose reconstructed participants carry synthetic `legacy_` uids that can never match. This is UX only, exactly like the other client-side role checks — see the standing `DESIGN.md` question about moving calendar writes behind the Worker.

### Fixed
- **Overlapping events on the Schedule were drawn on top of each other.** `layoutEvents()` compared each event against only the *last* event added to a group, so the common shape here — a three-hour supervisor slot with several short requests inside it — stopped registering as overlapping after the first, and every later event was drawn full-width over the session. It now builds clusters of transitively-overlapping events, packs each into the leftmost column free at its start time, then widens it rightward across columns nothing else needs while it is on screen, so an event only pays for the narrowness its neighbours actually cause. Side-by-side blocks get a pixel gutter, narrow blocks sit above wide ones so a short request inside a long session is never covered, and an event running past midnight is clamped to the end of the timeline instead of being drawn with a negative height.
- **A deleted session came back on the next refresh.** The `DELETE` itself was always correct; what followed was not. Google's `events.list` is eventually consistent and keeps returning a just-deleted event for a few seconds, so the reload fired straight after a delete put it back on the schedule and "Delete Session" looked like it had done nothing. `ScheduleContext` now tombstones the deleted id and filters it out of every consumer, retiring the tombstone once a later reload confirms Google has stopped listing it — so the set is self-cleaning and cannot grow unbounded.
- **Editing a special event rewrote it as a climbing session's shape.** The edit form only ever had the session path: it sent `start`/`end` as timestamps, so an all-day event silently collapsed onto midnight, and it offered no way to change the event's name. The form now takes its shape from what is being edited rather than from how it was opened — name and all-day switch for a special event, neither for a session — and `updateEvent()` clears the opposite time field explicitly so switching an event between all-day and timed cannot leave Google holding both `date` and `dateTime`. All-day events also now ask for the *last day inclusive* and convert to Google's exclusive end date on write, so a single-day event no longer has to be entered as a two-day one.
- **The gym-open banner counted special events as staffed sessions.** `getGymStatusFromEvents()` accepted any event whose `createdByRole` was supervisor or admin, which is set on every special event a supervisor creates — so putting a competition or a closure on the calendar reported the gym as open, with the event's name shown as the supervisor on duty. It now counts only real climb sessions.
- **The hardcoded super-admin was refused calendar writes.** The Schedule built its calendar identity from `profile.isAdmin` raw rather than through `domain/roles.ts`, so the `VITE_SUPER_ADMIN_EMAIL` account — an admin by email, without `isAdmin: true` on its profile — was offered the "+ Climb Session" button and then rejected by the service's own guard. Both calendar pages now derive that identity once, resolved, in `hooks/useCalendarUser.ts`.
- **`(requested)` was treated as part of a member's name.** `reconstructParticipantsFromTitle()` stripped a trailing `(super)`/`(sup)` but not `(requested)`, so a request with no tracked roster listed "Garry (requested)" as the person coming.
- **Calendar-tab jump-to-day landed behind the sticky heading**, which sits at the top of the list's scroll region and covered the day heading it had just scrolled to.

### Changed
- **Home: the "Add New Member" and "Sign-In Book" buttons are filled rather than outlined**, with centred labels, so all three actions on that screen read as one stack instead of one solid button above two outlines. The pending-sign-in count on Sign-In Book became a count-only badge positioned absolutely — "N pending" was wide enough to collide with the centred label on a narrow phone, and the alignment is the point.
- **The Schedule legend says "Climb Session" and "Special Event"** rather than "Supervisor" and "Events", matching the vocabulary the rest of the tab now uses.

---

## [Unreleased] — 2026-08-23

### Added
- **CI coverage for `worker/` and `firestore.rules`**: two new jobs in `ci.yml`, neither of which had any before. `worker-test` runs the Worker's typecheck plus its 24 token-verification tests — the JWT forgeries a verifier must reject (`alg: none`, HS256 confusion against the public modulus, post-signing tampering, cross-project `aud`/`iss`, expiry and clock skew), that opaque Google access tokens are refused, and that Google's live published signing keys still import under WebCrypto. `rules-test` runs 18 security-rules tests against the Firestore emulator.
- **`rules-tests/`**: a separate package for the security-rules tests rather than more cases inside `web/`'s vitest run. The Firestore emulator is a JVM application, so folding these into `web/` would turn `npm test` red for any contributor without a JDK, on a repo where nothing else needs one. `firebase-tools` is a devDependency there so `npm run test:emulated` works without a global install.
- **`web/scripts/generate-icons.py`**: regenerates the whole icon set from `KBC_logo.svg`, so the icons are reproducible rather than hand-made once. Handles two quirks of that file without modifying it — it is a traced bitmap carrying stray 1px slivers on its left and right edges, and its artwork sits off-centre in the frame, so the script trims, crops to the true content box and re-centres. Rasterising is done by headless Chrome because neither Pillow nor cairosvg can read SVG without native cairo.
- **`worker/scripts/get-admin-token.js`**: mints the Worker's Google refresh token. Ported from the deleted `mobile/scripts/get-admin-token.js` (`1cdfada`), but asks for a read-only scope and prints the token for `wrangler secret put` instead of writing it into a `.env`.

### Fixed
- **Every app icon was a scaffold placeholder.** The favicon, all PWA icons and the Apple touch icon shipped the generic blue Expo/Vite chevron, design guide-lines and all — only `kbc-logo.png` was the real mark, and nothing pointed at it. All are now generated from the vector logo. `favicon.ico` is multi-resolution (16/32/48/64) instead of a lone 64px, the maskable icon holds its artwork inside the 80% safe zone (verified against simulated circle and squircle crops), and `kbc-logo.png` itself is regenerated at 512px from vector rather than the previous 225px bitmap.
- **A blank white page for up to an hour after every deploy.** Firebase Hosting's default `Cache-Control: max-age=3600` applied to `index.html`, and nothing overrode it. A browser holding an hour-old shell requests the previous build's content-hashed asset, that file no longer exists in the new release, and the catch-all `**` rewrite answers with `index.html` as `text/html` — which a `<script type="module">` cannot parse, so the page renders empty with no visible error. Installed PWAs were insulated by their precache; this hit browser-tab users and fresh visitors. `firebase.json` now sets `no-cache` on the app shell and service worker (still cached, just revalidated first — a cheap 304) and marks `/assets/**` `immutable` for a year, since those URLs' bytes never change.
- **Pre-registered admins and supervisors could not sign in.** When an admin added someone to the roster and marked them supervisor, that person's first Google sign-in failed: `findOrLinkProfile()` copies their pre-registration profile to the real Firebase UID carrying `isAdmin`/`isSupervisor`, and both `create` branches rejected it — the self-create branch forbids either flag, and `isSupervisorOrAdmin()` reads `users/{auth.uid}`, the very document being created. The resulting `PERMISSION_DENIED` was not caught (that `setDoc` had no `try`/`catch`), so it threw into `ProfileContext.loadProfile`, whose `catch` only warns; `profile` stayed `null` and `OnboardingGate` redirected to `/setup`. The new supervisor landed on the brand-new-member form, and completing it minted a second profile with `isAdmin: false` while the original was orphaned. The client now writes `linkedFrom: <oldUid>` and the rules re-read that profile to confirm it exists, carries the same email, and already held the flags being claimed — so the branch can carry privileges across but never mint them. Ordinary pre-registered members were unaffected.

### Changed
- **CI runs on Node 24 throughout, on current action majors.** `actions/checkout` v4 → v7, `actions/setup-node` v4 → v7, `actions/setup-java` v4 → v5, `actions/cache` v4 → v6; every job's `node-version` 20 → 24. The action bumps clear GitHub's deprecation of the Node 20 *action runtime* (distinct from the Node the project builds on); the `node-version` move is because Node 20 is past end of life. Uniform versions also remove a real bug class — the rules tests' first run failed only because that job sat on Node 20 while they were written on 24, so a glob pattern that worked locally was silently unsupported on the runner. `worker-test` keeps a documented floor: its tests import a `.ts` file and rely on Node's type stripping, on by default only from 22.18.
- **`CLAUDE.md`**: records `rules-tests/` and the four CI jobs, and corrects the `worker/` entry, which still advertised the Google OAuth access token path removed below.

### Security
- **Worker no longer trades anyone's Google token for a KBC calendar token.** `verifyGoogleAccessToken()` validated a Google OAuth access token by asking Google's `tokeninfo` endpoint whether it was live and returning `res.ok`. But `tokeninfo` is a public introspection endpoint: it answers for *any* valid access token issued to *any* OAuth client, which is why its response carries an `aud` field — and that field was never checked. Anyone could register their own OAuth app, mint a token for their own account, present it, and receive a KBC admin calendar token. A textbook confused deputy. Checking `aud` would have closed it, but the only caller of that path was `mobile/` — never shipped, since deleted — so the path was removed outright. Opaque tokens now fail closed. Verification moved to `worker/src/verifyIdToken.ts` with an injectable JWKS source so it can be tested against a synthetic signing key.
- **The admin calendar token is now read-only.** It had been minted with `calendar.events`, which permits creating, editing and deleting events, while `web/` only ever calls `listUpcomingEvents()`. Rotated to `calendar.readonly`, so even a legitimately authenticated caller can only read. This required a new OAuth client: Google reveals a client secret only at creation and Cloudflare Worker secrets are write-only, so the original secret was unrecoverable — a rotation means moving `GOOGLE_ADMIN_CLIENT_ID`, `GOOGLE_ADMIN_CLIENT_SECRET` and `GOOGLE_ADMIN_REFRESH_TOKEN` together.
- **OAuth credential surface cut from six clients to two.** The Android and iOS Firebase apps left behind by the deleted Expo client were removed, taking their auto-generated OAuth clients and API keys with them, along with the retired `calendar.events` desktop client. What remains is the Worker's read-only client and the web client Firebase Auth uses for Google Sign-In.

---

## [Unreleased] — 2026-08-21

### Added
- **Web app migration**: new Vite + React + TypeScript PWA in `web/`, alongside the existing Expo app (moved to `mobile/`, frozen at feature parity). Same Firebase project, Firestore data model, and role hierarchy. See [WEB-MIGRATION-PLAN.md](./WEB-MIGRATION-PLAN.md) for the full plan and [web/CLAUDE.md](./web/CLAUDE.md) for current per-tab status. All six tabs now have real content:
  - **Home**: session sign-in (daily-limit enforced, active/pending membership, punch-pass use-or-buy choice), purchase-access (UI only — writes `pending` status for admin confirmation, matching mobile, no real payment processing), add-new-member-via-supervisor, gym-open/closed banner derived from the calendar.
  - **App entrance**: new-member setup form and membership/liability waiver signing (legal text ported verbatim), including a supervisor signing a waiver on behalf of a member they just created.
  - **Schedule / Calendar**: read-only day timeline and month view of the shared KBC calendar, reading through the admin-mediated Cloud Function rather than a per-user Calendar OAuth token (a deliberate divergence from mobile — see `web/src/services/calendar.ts`).
  - **Members**: searchable directory, admin/supervisor-editable membership panel (pass tier, dates, punch count, supervisor toggle, pending-purchase confirm/cancel), and Admin Management (grant/revoke admin) — now reachable from a button mobile itself never wired up.
  - **Boulders** (KBC mode): season selection, the community boulder list with filter/sort, grade + quality voting, likes, project marking, comments, logging an ascent/attempt, and admin add/edit/remove/moderate. Boulders' Personal mode (a separate self-contained data model for non-KBC problems/locations) is not yet ported.
  - **Log Book**: personal climb log, date-grouped, with logging/editing a climb at KBC or a custom location (including creating the location), delete, and filtering/sorting.
  - Plus: PWA install support (manifest, service worker, iOS/Android install prompts) and a Firestore data-integrity fix (see Fixed, below).
- **Firebase Hosting: second site for web/**: `firebase.json`/`.firebaserc` define an `admin` hosting target (existing `admin-web/` site, unchanged) and a `web` hosting target pointed at the Firebase project's previously-unused default site (`kbc-app-3307b`, already an authorized Auth domain). A `deploy-web.yml` GitHub Actions workflow builds and deploys `web/` to a PR preview channel or live on merge to `main`, using a `FIREBASE_SERVICE_ACCOUNT_KBC_APP_3307B` repo secret (now configured) — the deploy step skips cleanly with a warning rather than failing the check if that secret is ever missing.

### Fixed
- **Orphaned member profile docs (web/)**: linking a manually-created member's profile (synthetic `manual_<timestamp>_<random>` doc ID) to their real Firebase UID on first Google sign-in now deletes the superseded doc instead of leaving a permanent duplicate behind.

### Changed
- **Repo layout**: the Expo app moved from the repo root into `mobile/` (pure relocation, no code changes) to make room for `web/`.
- **The web app is now *the* app.** The Expo build in `mobile/` was never released and has no users, so it's no longer framed as a co-equal client "frozen at parity" — it's a porting reference kept only until `web/` closes its last feature gaps, then deleted. Docs updated throughout (`README.md`, `CLAUDE.md`, `mobile/CLAUDE.md`, `web/CLAUDE.md`, `DESIGN.md`, `WEB-MIGRATION-PLAN.md`) to reflect that, including removing the now-moot "keep mobile as a fallback" reasoning.
- **Calendar mediation — corrected record**: docs claimed Google Calendar access was mediated by `functions/getAdminCalendarToken`. It never was — that Cloud Function was never deployed (the Cloud Functions API isn't enabled on the project) while the Cloudflare Worker in `worker/` served the endpoint all along. The misleadingly-named `*_CLOUD_FUNCTIONS_BASE_URL` env var is what obscured this.

### Removed
- **`mobile/`**: the entire Expo/React Native app, deleted. It was never released — no App Store, no Play Store, no lasting tester distribution, no users — and `web/` now covers everything that mattered. Recoverable in full from git history at **`1cdfada`** (`git show 1cdfada:mobile/<path>`); the `// Ported from mobile/...` provenance comments throughout `web/src` still point at real, readable files there. Its CI job (`mobile-lint-and-test`) went with it.
- **`functions/`**: deleted. Never deployed, unreferenced by `firebase.json` and CI, and duplicated by the live `worker/` — it was a trap for anyone reading the repo. Recoverable from git history.
- **`EXPO_PUBLIC_GOOGLE_ADMIN_REFRESH_TOKEN` from `mobile/.env`**: Expo inlines `EXPO_PUBLIC_*` into the shipped bundle, so this put a long-lived KBC-admin credential inside every mobile build. Confirmed unused by any runtime code (only a one-time generator script referenced it) before removing. Low real-world impact since no mobile build was ever distributed.

### Security
- **Worker now verifies Firebase ID tokens**: `worker/` accepts either a Google OAuth access token (as `mobile/` sends) or a Firebase ID token (as `web/` sends). ID tokens are fully verified — RS256 signature against Google's published JWKs, plus `aud`/`iss`/`sub`/`exp`/`iat` with clock-skew tolerance — not merely decoded.
- **Secret scanning**: added `.gitleaks.toml` allowlisting the Firebase *web* API key, which is public by design (it ships in every web bundle and is retrievable via `firebase apps:sdkconfig`). Scoped to that exact key value, so any other secret in the same files is still caught.

---

## [Unreleased] — 2026-06-14

### Added
- **Membership waiver (Share Purchase for Lifetime Membership)**: new required waiver added to the onboarding flow. New members must sign the Share Purchase form before the Liability waiver. Includes mission, vision, values, agreement terms ($10 CAD share), and electronic signature consent. Stored as `waiverMembership` on the member profile.
- **Waiver gate — persistent tabs guard**: the tabs layout (`(tabs)/_layout.tsx`) now re-checks both waivers on every profile update. Any member missing either waiver is redirected immediately, regardless of how they reached a tab (deep link, back navigation, etc.). This is in addition to the existing one-time check in the root layout on login.
- **Waiver signed timestamp in Members panel**: the waiver rows in the member detail card now show the full date and time the waiver was submitted (e.g. "Jun 14, 2026, 3:42 PM").
- **Members panel — membership waiver row**: the Documents section now lists both the Share Purchase waiver and the Liability waiver for each member, with signed timestamp or "Tap to sign →" for each.

### Changed
- **Onboarding waiver sequence**: after completing the member setup form, new members are routed to the membership waiver first, then the liability waiver. Both must be signed before reaching Home. The root layout checks membership waiver before liability waiver.
- **Liability waiver — updated text**: section heading updated to "Electronic Signature Consent to Waiver" to distinguish it from the membership consent heading.
- **New member setup button**: "Continue to Waiver" renamed to "Continue to Membership Forms" to reflect the two-step signing flow.

---

## [Unreleased] — 2026-06-04

### Added
- **New member onboarding gate**: first-time Google sign-in (no existing Firestore profile) routes to a mandatory setup form (`/new-member-setup`) before entering the app. The form collects Legal Name*, Preferred Name, Phone, and Emergency Contact (Name*, Relationship*, Phone*). Email is locked to the Google account. The Firestore profile is created only on form completion — no document is written on sign-in alone.
- **Waiver gate on sign-in**: after the member setup step, users who have not signed the liability waiver are redirected to the waiver screen before reaching Home. Both onboarding steps use `router.replace` so back navigation is impossible during the mandatory flow.
- **Sign-in confirmation workflow — Pending sign-ins**: non-supervisor members' session sign-ins now create a `status: 'pending'` log entry. Supervisor-initiated sign-ins (their own or signing in others) bypass pending and are immediately confirmed.
- **Sign-in confirmation workflow — Supervisor ✓/✕ actions**: pending entries in the Sign-In Book show an orange "Pending" pill and present ✓ (confirm) and ✕ (deny) action buttons to supervisors/admins in place of the usual Edit/Delete buttons. Confirming writes `status: 'verified'`, `verifiedBy`, and `verifiedAt` to the log entry. Denying deletes the entry.
- **Verified sign-in label**: confirmed entries display a small green "✓ verified by [supervisor name]" line beneath the member name.
- **Daily sign-in limit**: one session sign-in per member per calendar day (resets at midnight local time). A second sign-in attempt for the same day shows an alert; no duplicate entry is created.
- **Daily limit reset on delete/deny**: deleting a sign-in entry or denying a pending one resets `lastSignInAt` on the member profile (if that was their only sign-in entry today), allowing them to sign in again.
- **Log Climb button — top of screen (Log Book tab)**: the floating "Log Climb" button has been moved from the bottom FAB to the top bar, alongside the location picker, filter, and summary icons. This reduces the vertical footprint of the header area.
- **Log Climb button — top of Climbs tab**: a "Log Climb" button now appears in the top bar of the Climbs (boulders) screen in both KBC and Personal modes. In Personal mode it opens the add-problem flow; in KBC mode it navigates to the Log Book tab.
- **Effort bar — Neutral label**: the effort bar now shows "Neutral" as a centered label between "Easy" and "Hard".
- **Token-expiry forced re-sign-in**: if the app has been in the background for ≥ 2 hours, it now forces the user back to the sign-in screen on resume to avoid stale-token Firestore errors. Additionally, if all token-refresh paths fail (expired refresh token + Google silent sign-in failure), the session is cleared immediately and the user is returned to login.

### Changed
- **Profile creation — deferred to onboarding form**: `getOrCreateProfile` replaced with `findOrLinkProfile` (returns `null` for brand-new users) + `createSelfRegisteredProfile` (called only when the onboarding form is submitted). Existing email-matched profiles (manually created before first Google sign-in) are still linked to the Firebase UID on first sign-in.
- **Member field rename — "Google Account Name" → "Legal Name"**: the locked `profile.name` field in the profile edit modal is now labelled "Legal Name" instead of "Google Account Name".
- **Delete sign-in — calendar-day reset logic**: the `lastSignInAt` reset after a delete now uses the calendar day (midnight boundary) instead of a rolling 24-hour window.
- **Calendar — Special Events on Home**: the Home screen now only shows events that were explicitly created as "Special Events" through the app (via the supervisor/admin add-event flow). Regular Google Calendar entries and supervisor climb sessions no longer appear in the "Special Events Today" section. Heading changed to "★ Special Events Today".
- **Default effort level**: effort defaults to the midpoint (Neutral / 50 %) instead of unset in both the KBC boulder log modal and the personal climb log modal.
- **KBC boulder log — Personal Grade removed**: the "Personal Grade" selector has been removed from the KBC boulder log modal. The established grade is still derived from the community average grade and stored internally.

### Removed
- **Boulder badges — "Others" category**: the emoji-themed badge group ("Joy", "Peaceful", "Pain", "Cry", "Anger", "Ego-Breaker", "Joke", "Outrageous", "OMG", "Love it", "Hate it", "Suffer") has been removed from both the app and the admin web interface.
- **Members — Remove Member**: the "Remove Member" button and its delete flow have been removed from the app. Member deletion can only be performed from the admin web panel.
- **Members — Admin Management**: the "Admin Management" button (linking to the `/admin-management` screen) has been removed from the Members tab in the app.

---

## [Admin Web] — 2026-06-03

Changes to the admin web panel at `kbc-app-admin.web.app`.

### Added
- **Phone & Emergency Contact fields** — member add form and edit modal now include Phone, Emergency Contact Name, Relationship, and Phone.
- **Waiver display in edit modal** — edit modal surfaces the member's waiver status: digital (signed in-app, with download PDF), uploaded PDF (with view link), or "No waiver on file". A PDF upload widget is present in all cases to upload a physical waiver scan.
- **Waiver PDF upload** — admins can upload a scanned waiver PDF to Firebase Storage (`waivers/{uid}.pdf`); the download URL is saved to the member's Firestore doc.
- **Sortable table columns** — all four tables (Sign-In Book, Members, KBC Climbs, Purchases) now support click-to-sort on any column, with ascending/descending toggle.
- **Access Pass Start date** — member add form and edit modal now include an "Access Pass Start" date field (`accessPassStart`), alongside the existing end date.
- **Season management** — new 📅 Seasons button in KBC Climbs opens a modal to add/remove boulder seasons. New seasons appear immediately in the Add Boulder season dropdown.
- **Grade bar drag interaction** — the setter-grade bar in Add Boulder is now a continuous drag slider. Click and drag anywhere along the bar to move the green pin; grade snaps to nearest of the 5 values.

### Changed
- **Tables auto-load** — all section tables load automatically when switching to their tab; "Load" buttons removed.
- **"Membership" renamed to "Access Pass"** — all membership-related labels in the members section now read "Access Pass Status", "Access Pass Start", "Access Pass End Date" to match app terminology.
- **Default new-member status** — "Inactive" is now pre-selected when adding a member.
- **Delete button moved** — "Delete" removed from the members table row; replaced by a full-width "⚠ Permanently Delete Member" button at the bottom of the edit modal.
- **SUP / ADM split into separate columns** — the combined "Roles" column is now two separate columns ("SUP", "ADM") with colour-coded badges.
- **Setter field made optional** — setter name is no longer required when adding a boulder. Season is now required.
- **Setter Email removed** — removed from the Add Boulder form; not used in the app.
- **Legal Name column no longer wraps** — `white-space:nowrap` applied to keep names on one line in the members table.
- **Vouchers removed from Purchases** — voucher redemptions are recorded in the Sign-In Book; removed from the purchase type dropdown and receipts filter.
- **Member status filter removed** — the all-members status filter dropdown has been removed from the Members tab.

### Fixed
- **Add Boulder button** — `openBoulderModal()` was using `style.display=''` which fell back to `display:none` in CSS. Fixed to `style.display='block'`.
- **Edit Member modal** — same `display:none` fallback bug fixed.
- **Gym floor plan wall scaling** — wall heights and Y-positions in the SVG floor plan were incorrectly scaled by width (100) instead of height (62), making all walls ~60% too tall. Recalculated from the app's exact `GYM_WALLS` fractions.
- **Add Boulder visual redesign** — grade bar, badge icon discs, and gym floor plan now visually match the app.

---

## [Infrastructure] — 2026-06-02

### Migration: personal account → KBC-owned accounts

Migrated all project infrastructure from personal account (`16asb2@gmail.com`) to
the KBC gym account (`kingstonboulderingcooperative@gmail.com`).

#### Firebase
- New Firebase project: `kbc-app-3307b` (project number `451887190936`)
- Registered Android app with package `com.kbc.app`
- Registered iOS app with bundle ID `com.kbc.app`
- Registered Web app (`kbc-app-admin`) for admin-web hosting
- Firestore security rules redeployed; `isSuperAdmin()` updated to KBC email
- `.firebaserc` updated to point to `kbc-app-3307b`

#### Google Cloud Console (`kbc-app-3307b`)
- Web OAuth 2.0 client: `451887190936-inusdgb37bg3n59n5unp9dobtf4lmqt7`
- iOS OAuth 2.0 client: `451887190936-1lk1q56has03h02fgjm9lliso5384blc`
- Desktop OAuth 2.0 client created for admin token script (one-time use)
- Admin refresh token re-obtained for `kingstonboulderingcooperative@gmail.com` via `scripts/get-admin-token.js`

#### Expo / EAS
- New Expo account: `kbc-climb`
- New EAS project: `kbc-climb/kbc` (ID `695c47fa-5eb2-4e32-a1c8-e789ddd3defc`)
- All `EXPO_PUBLIC_*` environment variables added to Expo dashboard

#### app.json
- Package name: `com.kbcscheduler.app` → `com.kbc.app`
- Slug: `kbc-scheduler` → `kbc`
- Scheme: `volunteerscheduler` → `kbc`
- iOS bundle identifier: `com.kbc.app` (added)
- iOS URL scheme: updated to new OAuth client
- EAS project ID: updated to new project

#### Cloudflare Worker (`kbc-admin-token`)
- Worker re-deployed under KBC Cloudflare account
- Worker URL: `https://kbc-admin-token.kingstonboulderingcooperative.workers.dev`
- Secrets set: `GOOGLE_ADMIN_CLIENT_ID`, `GOOGLE_ADMIN_CLIENT_SECRET`, `GOOGLE_ADMIN_REFRESH_TOKEN`
- `wrangler.toml`: `FIREBASE_PROJECT_ID` updated to `kbc-app-3307b`

#### Admin web (`admin-web/`)
- Firebase config updated to new project
- `WEB_CLIENT_ID` updated to new OAuth client
- `KBC_ADMIN_EMAIL` updated to `kingstonboulderingcooperative@gmail.com`

---

## [0.2.3] — 2026-05-29

### Added
- **Admin web app** (`admin-web/`): standalone admin tool hosted at `kbc-admin.web.app`. Accessible only to members with `isAdmin` or `isSupervisor` set on their Firestore profile. Sections:
  - **Logbook** — date-range table of sign-in entries; export as CSV, PDF, or save PDF to Google Drive.
  - **Members** — full member directory with status filter; export as PDF or save to Drive.
  - **Waivers** — lists all members with a signed liability waiver; generate individual PDFs or save all to Drive at once.
  - **Receipts** — filters logbook for purchase events (entries with "Purchased:" or "Voucher code:" in notes); generate a PDF receipt per entry.
  - **Backup** — full JSON snapshot of Firestore (members, logs, boulders); download locally or save to Drive.
  - **Google Drive integration** — "☁ Drive" button in the header triggers a one-time OAuth consent (GIS token client, `drive.file` scope). On first use, a `KBC Admin/` folder structure is created automatically in the signed-in user's Drive (`Logbook Exports`, `Member Reports`, `Waivers`, `Receipts`, `Backups`). Folder IDs are cached in `localStorage` to avoid redundant API calls.
- **Access Passes — Voucher option**: new "Voucher" entry in the access pass list. Selecting it shows a text input for the voucher number (confirm button disabled until filled). Logs `accessType: Voucher` and `notes: Voucher code: <code>` in the sign-in book; only updates `lastSignInAt` on the member profile (no membership fields changed).
- **Boulder quality votes — standalone field**: `boulder.qualityVotes: Record<uid, number>` replaces per-log quality storage. One vote per user, voted from the Boulder Overview modal (same pattern as grade votes and likes). The `setQualityVote()` service function handles optimistic updates and Firestore persistence.

### Changed
- **KBC grade bar — pink color**: lightened from `#e8559a` to `#f5a5c9` for better visual balance across the 5-color grade spectrum.
- **KBC grade bar — community average marker**: changed from orange (`#FF6600`) to solid yellow (`#FFE600`), matching the effort bar marker color.
- **Effort bar marker**: restructured from inside the track (clipped by `overflow: hidden`) to a sibling View using the same flex-based absolute positioning as the grade bar marker. Marker now extends 2 px above and below the track on both ends.
- **Boulder Overview — Personal Comments position**: moved to the bottom of the overview modal, after the Personal Climb Log section (previously appeared before community badges).
- **Boulder Overview — Quality votes source**: star rating in the overview now reads from `boulder.qualityVotes` directly with local optimistic state; log-entry quality data is no longer used for community display. Quality input removed from the log entry modal entirely.

---

## [Unreleased] — 2026-05-20

### Added
- **Boulder List — Camera icon on cards**: a 📷 indicator appears in the top-right of any ClimbCard that has a photo stored, so photo availability is visible without opening the problem.
- **Boulder Edit — Admin grade vote deletion**: admins and supervisors can tap ✕ next to any individual grade vote (including the setter's initial vote) to remove it. Changes apply immediately without requiring a form save.
- **Personal Climb Log — Photo field**: the Edit Climb form now includes a photo picker and preview (base64, quality 0.4). Photos persist across app reinstalls because they are stored as base64 data URIs rather than local file paths.
- **Boulder photos — Pinch-to-zoom**: tapping a boulder photo opens a full-screen viewer with pinch-to-zoom, pan, and double-tap-to-zoom-reset gestures (Reanimated 4 + RNGH 2). Single-tap closes the viewer.

### Changed
- **Grade bar — Community average marker**: color changed from fluorescent green to bright orange (`#FF6600`) to contrast with both the bar colors and the user's own vote marker (teal green).
- **Boulder Overview — Photo height**: preview image height reduced from 220 px to 140 px so more of the overview card content is visible without scrolling.
- **Boulder Edit — Field order**: form reorganized top-to-bottom as: boulder number → name → tape color → setter → location → grade bar → grade votes list → photo → badges. Discussion section removed.
- **Boulder Edit — Badges**: badge grid is always expanded; collapsible dropdown removed.
- **Boulder Edit — Close returns to Overview**: dismissing or saving the edit form returns to the Boulder Overview card instead of dropping back to the list.
- **Boulder Overview — "Ascent Log" → "Personal Climb Log"**: section renamed and now shows only the current user's own entries on a white background.

### Fixed
- **Boulder photos going black**: replaced ephemeral `file://` URIs (invalidated on every EAS rebuild) with base64 data URIs stored directly in Firestore. Existing photos stored as `file://` paths display as blank; re-uploading restores them.
- **Climb Log edit — Location field blank**: modal re-initialisation was using a render-time `useRef` mutation that is silently skipped under React New Architecture's concurrent renderer. Replaced with `useEffect([editingClimb?.id, visible])`, which reliably runs after the commit phase.

---

## [Unreleased] — 2026-05-19

### Added
- **Climb Log — Sort bar**: horizontal chip row (↓ Date, ↑ Date, A–Z, Z–A, ★ Stars) above the list; replaces the sort option that was buried in the filter modal. Sort is preserved when opening/closing the filter modal.
- **Climb Log — Date section dividers**: when sorted by date, entries are grouped under "Today", "Yesterday", or full weekday + date headers. Other sort modes show a flat list.
- **Climb Log — `userName` saved on new entries**: display name is now stored on every new `climbLogs` document so the Ascent Log table in boulder overviews can show real names instead of anonymous fallbacks.
- **Boulder Overview — Personal Comments panel**: shows the current user's own climb notes with timestamps; other users' notes are not visible here.
- **Boulder Overview — Stats banner**: side-by-side "My" and "Total" sent/attempt counts.
- **Boulder Overview — Ascent Log table**: per-user log of all sends and attempts with timestamps; displays the actual name for new entries, "Member …xxxx" fallback for older ones.
- **Boulder List — User sents/attempts on cards**: fluorescent-green send/attempt counts shown on each ClimbCard for the current user.
- **Boulder List — "Only unsent" filter**: hides problems the current user has already sent.
- **Boulder Edit — Grade votes table**: visible to the problem owner and admins; lists every grade vote with a color-coded grade chip.

### Changed
- **Grade bar marker**: community-average marker changed from red to fluorescent green (`#AAFF00`), 4 px wide, extends 2 px beyond the bar height on both ends so it is slightly taller than the bar.
- **Boulder List — scroll position preserved**: returning from a boulder overview no longer resets the list scroll position or clears active filters.
- **Climb Log — Personal Grade field removed**: the per-entry personal grade input has been removed from the log entry form (existing stored data is preserved).
- **Climb Log — Filter count**: sort order no longer counts as an active filter (it lives in the always-visible sort bar instead).

### Fixed
- **Climb Log — Sector/area not saved on edit**: opening an existing log entry now correctly pre-selects and saves the stored sector/area instead of always defaulting to the first one.
- **Firebase 401 after inactivity**: `getFirebaseToken()` now returns the cached (still-valid) token as a fallback when all refresh paths fail, rather than returning `null` and sending unauthenticated requests.
- **Calendar join — legacy events lose supervisor name**: joining a supervisor session that predates participant tracking no longer overwrites the original supervisor; participants are reconstructed from the event title before appending the new joiner.
- **Calendar cancel — name not removed from title**: leaving a session now correctly filters participants by both UID and display name, handling both tracked and legacy (title-reconstructed) entries; the event title is rebuilt without the cancelled user.
- **Calendar join — supervisor badge**: users who are supervisors and join a session are correctly labelled `(super)` in the rebuilt event title.

---

## [0.2.x] — previous

### Fixed
- **Google Sign-In `DEVELOPER_ERROR` on dev builds** — EAS creates a separate keystore per Android package name. The SHA-1 for `com.kbcscheduler.app.dev` was not registered in Firebase, causing sign-in to fail immediately on development builds. Fixed by registering the correct SHA-1 for each package in Firebase Console and re-downloading `google-services.json`.
- **Firebase UID vs Google user ID mismatch** — `context/auth.tsx` was storing the Google user ID as `user.id`, but Firestore rules compare against the Firebase Auth UID (`localId` from Identity Toolkit). Fixed by extracting `localId` from the `signInWithIdp` response.
- **Race condition on sign-in causing 403s on first load** — `setUser()` was called before `exchangeGoogleIdToken()` completed. Fixed by registering the auth bridge and storing the Firebase token before calling `setUser()`.
- **`personalProblems` collection returning 403** — missing `authBridge` import and missing Firestore security rule. Fixed both.
- **`google-services.json` OAuth client entries** — both Android apps now have the correct SHA-1 Android OAuth clients alongside the shared web client.

### Changed
- **Log form parity across all entry points** — `BoulderLogModal` and `PersonalLogModal` now expose the same fields as the Log Book form, including attempts, quality star rating, badges, and the `EffortBar` continuous slider (replacing string-based Easy/Medium/Hard/Impossible chips).
- **Auto-fill on Climbs-tab log forms** — location, area, name, and grade are pre-populated from the boulder/problem definition.
- **Build configuration** — `app.config.js` and `app.json` aligned with EAS project ID and Android package variants.

---

## [0.2.0] — 2025-05-12

### Added
- Boulder summary screen with bar charts of personal climb history.
- Setter badge votes on boulder detail.
- EAS build workflow with Firebase App Distribution for internal preview builds.

### Fixed
- Badge list display bug.
- Community grade voting decoupled from personal grade.
- Log button added to boulder Overview modal.
- 5-box personal grade selector in climb log.
- `orderBy` removed from Firestore equality-filter queries (requires composite index — sorted client-side instead).
- Sort bar layout fixes.
- UI polish and sign-in history fixes.
