# KBC App — Design Document

## What the app is and who it's for

**KBC Scheduler** is the member app for **Kingston Boulder Cooperative (KBC)**, a member-run climbing gym in Kingston, Ontario. It replaces paper sign-in sheets, a shared Google Calendar, and informal boulder tracking with a single app.

**Users:**
- **Regular members** — sign in to climbing sessions, browse the schedule, log personal climbs, vote on boulders
- **Supervisors** — volunteer members who open the gym; can sign others in, manage the calendar, open the gym
- **Admins** — board members; can manage memberships, grant/revoke supervisor status, create special events

The app is internal-only, for a small user base (~dozens of members) — no public app store involved.

> **The app is now a web app (PWA)**, in `web/`, installable to a phone home screen. The original Expo build in `mobile/` **was never released and has no users**; it's kept only as a porting reference and will be deleted once `web/` closes its remaining gaps. See [WEB-MIGRATION-PLAN.md](./WEB-MIGRATION-PLAN.md) for the background and [web/CLAUDE.md](./web/CLAUDE.md) for the web app's architecture notes.
>
> **How to read the rest of this document:** the product design below — roles, membership model, permissions, workflows, data schema — is current and applies to `web/`. Anything phrased as "how the app currently does X" describes `mobile/`'s implementation, which is now history rather than a constraint; `web/` deliberately diverges where the web platform called for it (see web/CLAUDE.md).

---

## Current Version
**v0.5** — May 2026
See [CHANGELOG.md](./CHANGELOG.md) for full history.

---

## Current Feature Status

### ✅ Done

| Feature | Notes |
|---|---|
| Google Sign-In (OAuth) | All access gated behind Google account |
| Member profiles | Stored in Firestore; name, membership type, punch passes, waiver |
| Waiver signing flow | Dynamic waiver per type (`/waiver/[type]`) |
| Sign-in logbook | Home tab; supervisors can sign in any member or punch pass holder |
| Gym open/closed status | Real-time; triggered when a supervisor physically signs in (not calendar-derived) |
| Schedule tab | Timeline view of upcoming sessions from Google Calendar |
| Month calendar view | Visual calendar for browsing sessions |
| Add/edit climb sessions | Supervisors add sessions (tagged as supervisor slot); regular members request sessions |
| Boulder problem database | Community list with grade voting, quality voting, badge tagging |
| Boulder logging from Boulders tab | Logs ascents/attempts; updates community aggregates |
| Personal climb logbook | Unified log for KBC + custom locations, with grade systems, effort, quality, badges |
| Custom climb locations | Users can create indoor/outdoor locations with sectors |
| Climb summary chart | Bar chart of sends vs attempts by grade, with stats pills |
| Member directory | Admin/supervisor only; shows all members |
| Supervisor management | Admins can grant/revoke supervisor status |
| Swipe navigation | Gesture-based swipe between all tabs |
| KBC grade bar | 5-color interactive slider (White → Black) used across boulders + climblog |
| Badge icons | 40 hold-type badges with SVG-style icons, used in boulders + climblog |

### 🔄 In Progress / Planned

| Feature | Status | Notes |
|---|---|---|
| Admin isAdmin via Firestore | Planned | Currently hardcoded in `constants/admins.ts` — baked into APK; next build should move this to Firestore |
| Calendar write centralization | ✅ Done (v0.5) | All writes flow through the KBC super-admin account via stored refresh token — no per-supervisor calendar sharing needed |
| Calendar ACL management in-app | Future | In-app grant/revoke of Google Calendar read access per supervisor (Google Calendar ACL API) — lower priority now that writes are centralized |
| Camera (photo on boulder log) | Future | Not implemented; no permissions declared yet |
| GPS / location auto-fill | Future | Not implemented; no permissions declared yet |
| Push notifications | Future | No backend to trigger them; would require FCM + a server or Cloud Function |
| iOS build | Future | Android-only for now; no Apple Developer account yet |
| Play Store / public distribution | Future | Currently APK-only via EAS preview builds |

---

## Technical Decisions and Rationale

### No Firebase SDK — Firestore via REST
Expo SDK 54 with New Architecture (`newArchEnabled: true`) is incompatible with the Firebase JS SDK. Rather than downgrade or use compatibility shims, we call the Firestore REST API directly with `fetch`. This means:
- Every service file (`boulders.ts`, `climblog.ts`, `logbook.ts`, etc.) re-declares the same small set of REST helpers (`encodeVal`, `decodeVal`, `fsPatch`, `fsPost`, `fsQuery`, `fsDelete`)
- This is intentional duplication — keeps each service self-contained and avoids a shared module that might be hard to debug
- **Critical constraint**: Firestore REST returns a 400 if you combine an equality `where` filter with `orderBy` on a different field without a composite index. We never create indexes — always sort client-side after fetching

### No backend server
The app talks directly to Google's APIs from the device. There is no custom API, no server, no Cloud Functions. This simplifies deployment (no infra to maintain) but means:
- No server-side validation
- No push notifications (no server to send them)
- API keys are hardcoded (acceptable for an internal app with a small, known user base)
- Admin list was originally hardcoded; moving to Firestore in the next build

### Google OAuth for everything
All auth flows through Google Sign-In. The access token from Google is reused for both Firestore (via API key, not token) and the Google Calendar API (token required). Role data (supervisor, admin) is stored in Firestore, not in Google.

### Gym open status — Firestore, not Calendar
An earlier design used the calendar schedule to infer whether the gym was open. This was unreliable (events could be in the past, cancelled, etc.). The current design has a dedicated `gymStatus/current` Firestore document that is written when a supervisor physically signs in. It stores `openedBy`, `openedAt`, and `closesAt` (2-hour window). The calendar is still used to show "next session at X" when closed.

### Unified `climbLogs` collection
Personal climb entries for both KBC boulders and custom locations live in a single flat collection (`climbLogs/{id}`) with a `locationId` field (`'kbc'` or a `ClimbLocation.id`). This avoids subcollections and makes querying all of a user's climbs simple. Community aggregates (grade votes, quality votes, badge votes, ascent/attempt counts) remain on the boulder document — they are a separate concern from the personal log.

### Grade systems
- **KBC grades**: 5 colors (White → Black), stored as vote indices 0–4 in `Record<uid, number>`
- **Personal grades**: V-scale (19 grades), Fontainebleau (23 grades), or YDS (36 grades) depending on discipline; stored as free-text strings
- Boulder discipline → user picks V-scale or Font; roped disciplines → YDS locked
- The `GradeBar` component handles both community voting (multiple user votes → average marker) and personal single-user selection

### View-based icons, no icon library
The `HoldIcon` component in `components/badge-icon.tsx` renders 40 different climbing hold icons using composed `View` elements (circles, rectangles, borders). No SVG library, no image assets. This keeps the bundle small and avoids SVG rendering issues on Android New Architecture.

### Swipe navigation
`react-native-gesture-handler` `Pan` gesture wraps the entire tab layout. Tab order matches a logical gym workflow: Home → Schedule → Calendar → Members → Boulders → Log Book.

---

## Open Questions / Unresolved Decisions

| Question | Context |
|---|---|
| **Move `isAdmin` to Firestore?** | Currently hardcoded in `constants/admins.ts` — can't change without a rebuild. Plan is to add `isAdmin` field to member docs and bootstrap via Firebase Console. Needs to happen before wider distribution. |
| **Calendar ACL management in-app?** | Write operations no longer require per-user calendar sharing (v0.5). Read access still requires the calendar to be publicly readable or individually shared. In-app ACL grant/revoke (tied to the supervisor toggle) would be a polish improvement but is no longer blocking. |
| **Calendar writes are guarded client-side only** | The Worker hands the same `calendar.events` token to any signed-in user, and who may create or delete a session is checked in `web/src/services/calendar.ts` before the call. Firestore rules cannot guard Google Calendar, so a member could take a token the Worker gave them and call the Calendar API directly. The fix is to move writes behind the Worker — it would hold the scope, verify the caller's Firebase ID token, and enforce the role itself — so no browser ever holds a write-capable token. Deferred: it turns the Worker from one endpoint into a real API. |
| **Punch pass vs membership model** | Both exist but the distinction isn't fully enforced in the UI. What exactly can punch pass holders do vs full members? |
| **Boulder seasons** | A `seasons` collection exists in Firestore but the UI for managing season transitions (archiving old boulders, starting a new season) is not built yet. |
| **Waiver versioning** | The waiver is stored as a flag on the member doc but there's no version tracking. If the waiver text changes, existing members won't be prompted to re-sign. |
| **Photos in Firebase Storage?** | Resolved for now by moving them to `media/main` subdocuments (v0.9) — see below. Storage would be better still: a CDN-served URL beats a base64 blob through Firestore, and a 1 MiB document limit currently caps a photo. It needs a bucket, its own rules file, and an upload path, none of which exist yet. |
| **iOS** | Nothing native is planned — `web/` is the only client and installs as a PWA. What remains is an on-device install check on a real iPhone (Phase 6) and the photo-storage change above. |
| **What happens when gym closes?** | `gymStatus/current` sets a 2-hour `closesAt` window but there's no mechanism to close early or extend. Supervisors currently can't "close" the gym explicitly — it just times out. |

---

## Architecture at a Glance

```
Device
  └── React Native / Expo (Android)
        ├── Google Sign-In (OAuth 2.0)
        │     └── Access token → Google Calendar API (read/write events)
        ├── Firestore REST API (no SDK)
        │     ├── members/{uid}
        │     ├── logs/{id}           ← sign-in logbook
        │     ├── gymStatus/current   ← live gym open state
        │     ├── boulders/{id}       ← community problem database
        │     ├── seasons/{id}
        │     ├── climbLogs/{id}      ← personal climb history
        │     ├── climbLocations/{id} ← user-created locations
        │     └── sessionRequests/{id} ← member session requests
        └── (no custom backend)
```

---

## User Document Schema (v0.2)

```
users/{uid}:
  name:               string        // Google account name (locked)
  legalName:          string?       // admin-only editable
  email:              string        // Google account email (locked)
  photo:              string | null
  membershipAccessPass: 'annual' | '8month' | '4month' | '1month'
                      | 'punch' | 'dropin' | 'none'   // which pass they hold
  membershipConfirmed:  boolean      // false = purchase awaiting admin confirmation
  isAdmin:            boolean       // Firestore-managed; except SUPER_ADMIN_EMAIL (hardcoded)
  isSupervisor:       boolean
  punchPassRemaining: number
  memberSince:        string        // ISO — first registration
  membershipStart:    string | null // ISO — start of current paid period
  membershipExpiry:   string | null // ISO — end of current paid period
  waiverLiability:    string?       // JSON WaiverRecord
  preferredName:      string?
  additionalEmails:   string?       // JSON string[]
  preferredEmail:     string?
  phone:              string?
  emergencyContact:   string?       // JSON EmergencyContact
  additionalComments: string?
  pendingPunches:     number | null
  pendingMembership:  string | null // JSON { label, price, start, expiry }
  lastSignInAt:       string?       // ISO — enforces 24h rule
  profileReviewedAt:  string?       // ISO — the member confirmed this record themselves
  linkedFrom:         string?       // id of the pre-registration record this was claimed from
  lastUpdatedBy:      string?
  lastUpdatedAt:      string?
```

**Joining a member to their account (v0.6).** Members exist as documents before
they ever sign in — a CSV import, or a supervisor adding a walk-in. Three things
have to happen on that first Google sign-in, and each is a separate rule:

1. **Matched by email** (`findOrLinkProfile`). The record is copied onto the
   real Firebase uid and the original deleted. `linkedFrom` names the original,
   which is what lets `firestore.rules` verify that any `isAdmin`/`isSupervisor`
   being carried over was already granted, and now also what permits the delete.
2. **Identified by legal name, by the member themselves.** Email finds the
   easy cases and misses the ones that matter: members change addresses, and
   the sheet has whichever one they used years ago. So the setup form opens by
   asking for the legal name — the identity the gym actually files records
   under — looks for every record carrying it, and shows what it found:

   > *We already have a member on file under that name. Is this you?*
   > **Jane Smith** · j•••@gmail.com · Member since 2019

   Choosing one adopts it whole. "None of these" registers a new member.

   **Nothing is guessed.** An earlier version matched a name silently, and only
   when exactly one record carried it — so two Jane Smiths matched neither,
   which reads as "we have never heard of you" and quietly created a third. Who
   somebody is has an answer, and the person signing in is the only one who
   knows it, so they are asked rather than guessed at.

   **The address is masked**, always. Whoever reads that screen has proved only
   that they can type a name, and a name is public knowledge around a gym; the
   full address would make the form a way of looking up any member's email.

   **Roles never cross a name match.** `firestore.rules` enforces this
   independently — a name-matched write reaches only the self-create branch,
   which refuses a document carrying either flag — so an imported supervisor
   must sign in with the address on their record, or be re-granted.

   **The trade is deliberate.** A member who knows another's full legal name,
   and is willing to claim to be them on a screen that says so, can reach their
   record. That is a smaller risk than the alternative, which was losing
   people's memberships, and it is one a co-op where members know each other can
   carry. Revisit if that stops being true.

3. **Two addresses, not one.** `email` is the Google account that signs in;
   `preferredEmail` is where KBC writes. Joining with whichever account is on
   the phone in your hand while being reached somewhere else entirely is the
   ordinary case, not an anomaly — so adopting a record keeps the address it was
   filed under as `preferredEmail`, and the setup form lets it be edited.

4. **Never lossy.**3. **Never lossy.** Whichever way a record is matched, the sign-in overwrites
   exactly three things on it — email, display name, photo — plus whatever the
   member typed into the setup form. Pass, punches, dates, waivers,
   `memberSince` and sign-in history are carried across untouched
   (`linkRecordToUid`). The one path that writes a whole fresh document checks
   first that the uid really is empty.

5. **Shown to its owner once** (`needsProfileReview`). A record can be complete
   and still wrong: nobody has checked what the spreadsheet said, and the waiver
   on the next screen is signed against it. The setup form appears prefilled,
   and `profileReviewedAt` records that they confirmed it. Members who onboarded
   before the field existed are recognised by holding a membership waiver, which
   an import cannot write.

**Membership status transitions:**
- New sign-up → `non-member`
- Purchases access → `pending` (awaiting admin confirmation) or directly deducts punch pass
- Admin confirms → `active`
- `membershipExpiry` passes → auto-transitioned to `inactive` by `checkAndUpdateMembershipStatus()`
- Punch-pass-only users stay `inactive` or `non-member` — punch passes are not memberships

---

## Permission Matrix (v0.2)

| Action | Non-member | Inactive | Active/Pending | Supervisor | Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| View schedule | ✅ | ✅ | ✅ | ✅ | ✅ |
| Join supervisor session | ✅ | ✅ | ✅ | ✅ | ✅ |
| Submit session request | ❌ | ✅ | ✅ | ✅ | ✅ |
| Create/edit calendar events | ❌ | ❌ | ❌ | ✅ | ✅ |
| Sign in members at gym | ❌ | ❌ | ❌ | ✅ | ✅ |
| View member directory | ❌ | ❌ | ❌ | ✅ (read) | ✅ (edit) |
| Grant/revoke supervisor | ❌ | ❌ | ❌ | ❌ | ✅ |
| Grant/revoke admin | ❌ | ❌ | ❌ | ❌ | ✅* |
| Edit membership status | ❌ | ❌ | ❌ | ❌ | ✅ |

*Cannot apply to self or to `SUPER_ADMIN_EMAIL`

---

## Admin Role Architecture (v0.2)

**Two-tier admin system:**

1. **Super-admin** — email hardcoded as `SUPER_ADMIN_EMAIL` in `constants/admins.ts`. Irrevocable — cannot be toggled off in-app. This is the initial board account.

2. **Dynamic admins** — `isAdmin: true` in their Firestore user document. Managed via the Admin Management screen (`/admin-management`). Any admin can grant/revoke other admins except themselves and the super-admin.

The `isAdmin(email, profileIsAdmin?)` helper in `constants/admins.ts` checks both sources.

**The flag lives on a record, and the record is not always at the uid.** Both clients grant on `users/{request.auth.uid}` — `firestore.rules`' `isSupervisorOrAdmin()` reads that document and nothing else — but an admin created in `admin-web/` (`addMember`, `runImport`) is a document under a generated id, and nothing exists at their Firebase uid until they sign in somewhere. The grant is therefore only real once the record has been **joined** to the account, and both clients do that join on sign-in, by email, down the rules' `linksOwnExistingProfile()` branch: `findOrLinkProfile()` in `web/src/services/profiles.ts` for members, `claimStaffRecord()` in `admin-web/index.html` for staff. Neither can mint a flag — the rules re-check `isAdmin`/`isSupervisor` against the record named in `linkedFrom`, whose stored address must match the token's.

Matching on a **legal name** is the member app's alone. It proves nothing — a legal name is public knowledge around a gym — so it needs the member to pick their own record out of a masked list, and the rules refuse to carry roles across it (the claimed record's flags travel as `claimedRoles` for an admin to grant deliberately). An admin whose record is filed under an address they no longer use therefore signs into the member app first; the admin panel does not offer that path, and its Access Denied screen says where to go.

---

## Calendar Mediator Architecture (v0.5)

All Google Calendar API calls go through `services/calendarService.ts`. No other file calls the Calendar API directly.

**Write operations use a centralized KBC super-admin account.** A refresh token for the super-admin Google account is stored in `.env` (`EXPO_PUBLIC_GOOGLE_ADMIN_REFRESH_TOKEN`). `services/adminToken.ts` exchanges it for a short-lived access token cached in memory (auto-refreshed ~60 s before expiry). No individual user's Google account needs write access to the KBC calendar.

```
services/adminToken.ts
  └── getAdminCalendarToken()               — fetches/caches admin OAuth access token

services/calendarService.ts
  ├── listUpcomingEvents(userToken)          — reads; uses the signed-in user's token
  ├── createSupervisorEvent(data, user)      — admin token internally; supervisors + admins only
  ├── joinSession(eventId, user, userToken)  — admin token for write; user token for event read
  ├── updateSupervisorEvent(id, patch, user) — admin token internally; supervisors + admins only
  ├── deleteSupervisorEvent(id, user)        — admin token internally; supervisors + admins only
  ├── createSessionRequest(data, user)       — admin token internally; members only
  └── createSpecialEvent(data, user)         — admin token internally; supervisors + admins only
```

**Session participant tracking:**
- Participants stored in `extendedProperties.private.participants` as JSON array `{uid, name, role}[]`
- Title rebuilt from participants: `"Artur (sup) + Garry + Andy"`
- Supervisors/admins get `(sup)` suffix in the title; regular members get none
- `joinSession` uses `PATCH` — event ID is preserved across participant joins (no delete+create)

**Admin token credential management:**
- Refresh token is bound to the Desktop OAuth client that issued it (`EXPO_PUBLIC_GOOGLE_ADMIN_CLIENT_ID/SECRET` in `.env`)
- If that client is ever deleted in Google Cloud Console, run `scripts/get-admin-token.js` with a new Desktop client to re-obtain the refresh token and update `.env`
- Env vars require a full Metro restart to pick up after changes

---

## Smart Sort (v0.6)

The default order for every member list: the picker behind **Sign In Another Climber**, the **Members** tab, and `admin-web/`'s member directory. Written and tested in `web/src/domain/memberSort.ts`; mirrored by hand into `admin-web/index.html`, which has no bundler.

**The ranking, in order:**

1. **Recency bucket** — days since `lastSignInAt`, grouped at 7 / 30 / 90 / 183, then "longer ago", then "never signed in".
2. **Access rank** — `0` holds something that admits them now (a confirmed dated pass, or `punchPassRemaining > 0`), `1` holds something that does not (unconfirmed pass, drop-in), `2` nothing.
3. **Exact `lastSignInAt`**, most recent first.
4. **Display name**, so the order is total.

**Why recency is bucketed.** The gym's stated rule is "last sign-in first, then whether they hold a pass". Applied to the raw timestamp, the second criterion is unreachable — millisecond timestamps never tie — so it would be a rule that reads well and never runs. Bucketing is what makes it mean something: inside a bucket the two members are equally recent as far as anyone at a desk is concerned, and the pass is the tie-break it was meant to be. The bucket edges are a judgement call, not a measurement; 183 matches `INACTIVE_AFTER_DAYS` so Smart Sort and the Activity badge do not disagree about the same member.

**Why the name is on the end.** Most of an imported roster has never signed in and holds nothing, so everything above ties. `Array.prototype.sort` is stable, but the *input* order is not — `getAllProfiles` and the panel's `memberList` come back in whatever order Firestore hands them — so without a final key the list reshuffles between loads.

**Keeping the copy honest.** `admin-web/` is one static HTML file: no bundler, no test run, so the rule is duplicated there rather than imported. `web/src/domain/memberSort.adminMirror.test.ts` lifts the panel's block out of the file, evaluates it, and asserts it ranks a fixture directory identically and agrees record-by-record on `isActiveMember`. That test reads `admin-web/` from `web/`'s suite — a boundary this repo otherwise keeps — and earns it by being the only thing that fails when the two drift.

**Active members.** `isActiveMember` is *not* purely a recency question: a confirmed pass or a punch in hand counts as evidence of a live member on its own. It previously read `lastSignInAt` alone, which listed a member who had just bought an annual pass as inactive. A sign-in dated in the future is excluded here but sorts as recent in `recencyBucket` — the one deliberate disagreement between the two, since a sort has to place every record somewhere while a badge should not assert a visit that has not happened.

---

## Why the app ran worse on iPhone than on Android (v0.9)

Reported as "slower to load and more buggy on iPhones". It is not one bug. Five
separate things were in play, all of them fixed here — though the largest, the
photo storage, also needs `scripts/migrate-photos.mjs` run against the database
before existing records stop paying for it.

**The short version.** Nothing in the app was iOS-specific *by intent*, but
almost everything expensive it did was sized for a desktop budget, and iOS
Safari is the one target that enforces a small one. Safari's web content process
is killed at a far lower memory watermark than Chrome on Android tolerates, so
the same page that merely feels heavy on a Pixel gets reloaded out from under
the user on an iPhone — which is what "more buggy" was describing. A blank tab
after a scroll is the tab having been killed and restored, not a rendering bug.

**1. The boulder list downloaded every boulder the gym had ever set.**
`getBouldersForSeason` read the whole `boulders` collection and picked the
season out in JavaScript. Every problem from every season, removed ones
included, each carrying a base64 `photo` on the document. Now filtered
server-side with `where('seasonId', '==', …)`. `getNextBoulderNumber` did the
same thing and got the same fix.

**2. Every card rendered a full-size photo as a data URI.** (See *the fix for
1 and 2* below for where the pictures went.) The cost is worse
than the transfer suggests. A 1080px JPEG is ~200 kB on the wire, ~270 kB as a
base64 string in JS, and — once the browser paints it — roughly
`width × height × 4` bytes as a decoded bitmap, about **6 MB** for one
1080×1440 photo. Thirty problems on one scrolling list is on the order of
180 MB of bitmap. Android Chrome absorbs that; iOS Safari does not.
Boulders now carry a second field, `thumb`: a 96px square JPEG at q0.6, a
couple of kB, generated alongside the photo and the only image the card draws.
The full picture loads when the overview modal opens, one at a time.

**3. Adding a photo from an iPhone failed outright.** `resizeImageFileToDataUrl`
went through `createImageBitmap`, which Safari rejects for HEIC blobs — and
HEIC is what the iPhone camera roll hands a file input by default. The same
file decodes fine through an `<img>` element, because WebKit supports HEIC in
its image pipeline but not its bitmap one. `utils/imageResize.ts` now falls
back to `<img>` + `decode()`. This one was genuinely iOS-only: on Android the
picker returns JPEG and the fast path always worked.

**4. Switching season refetched every KBC climb log.** `getKBCLogs()` reads the
entire `climbLogs` collection where `locationId == 'kbc'`, and
`handleSelectSeason` called it again on each switch even though those logs are
keyed by `problemInternalId` and are not season-scoped — the same rows, re-read.
Removed. The underlying read is still unbounded and grows with every climb
anyone logs; scoping it properly needs a season or date field on the log
documents, which is not in this change.

**The fix for 1 and 2, in full.** A photo is no longer a *field*. It lives in
`<collection>/{id}/media/main`, a subdocument, and a query on the parent does not
return subcollections — which is the whole property being bought. The screen that
shows a picture fetches it; nothing else pays. `web/src/services/photoStore.ts`
holds the read/write pair, `firestore.rules` gains a `media` match under both
collections, and `scripts/migrate-photos.mjs` moves what already exists. The
reader accepts both shapes, so the app works before the migration has been run
and after.

`climbLogs` had the same disease and a worse case of it: nothing in the app has
*ever* displayed a climb-log photo except the edit form that wrote it, yet
`getKBCLogs()` pulled every one of them into the Boulders tab on load. Those
photos are now owner-only as well — the parent stays readable by every member so
the community counts work, but the picture attached to it does not.

The card-sized icon stays on the boulder document deliberately: it is a couple of
kB and the list needs all of them at once, so a per-boulder round trip would
trade a small download for dozens of requests.

**Ruled out.** The viewport handling is already correct for mobile Safari —
`h-svh`/`max-h-[…svh]` throughout, chosen deliberately over `vh`/`dvh` so
expanding browser chrome cannot clip the layout (see `layout/AppShell.tsx`).
The swipe hook does not `preventDefault`, so it never fights Safari's scrolling.
Auth persistence already falls back from IndexedDB to localStorage, which is
what Safari private browsing needs.
