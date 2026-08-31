# scripts/

One-off maintenance tooling. Nothing here runs in CI or ships to either hosting
site — these are things you run by hand, deliberately, from your own machine.

Its own package rather than a folder inside `web/`: `firebase-admin` is a server
SDK holding credentials that **bypass `firestore.rules` entirely**, and it has no
business anywhere near a browser bundle's dependency tree.

```bash
cd scripts && npm install
```

## `inspect-users.mjs`

Read-only. Writes nothing, deletes nothing. **Run this before wiping.**

```bash
node inspect-users.mjs
```

It reports total documents against *distinct emails* — the second number is how
many members you should expect back after a re-import. A large gap means
duplicates, which is what the pre-fix import produced whenever the roster was
larger than the 500-member page it matched against: anyone past that cap was
invisible to the duplicate check and got created again on every run.

It also counts how many profiles carry a **waiver**, which no CSV column can
restore.

## `wipe-firestore.mjs`

Deletes Firestore collections so a clean re-import can replace them. **This
destroys production data and there is no undo.**

### Credentials

A service-account JSON for `kbc-app-3307b` — Firebase console → Project settings
→ Service accounts → Generate new private key. Treat it like a password: it
bypasses `firestore.rules` completely. Give it a name containing
`service-account`, which the repo's `.gitignore` already covers
(`*service-account*.json`), and prefer keeping it outside the repo entirely.

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/kbc-service-account.json
# or pass --key /path/to/kbc-service-account.json
```

The script refuses a key belonging to any other project.

### Rehearsing against the emulator

Point it at a local emulator to watch it work without risking anything. Needs a
JVM, same as `rules-tests/`:

```bash
firebase emulators:start --only firestore --project kbc-app-3307b
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node wipe-firestore.mjs --collections users,logs --confirm
```

### Usage

It is a **dry run by default** — it prints what it found and deletes nothing
until `--confirm`, and then still makes you type `DELETE kbc-app-3307b`.

```bash
# look, don't touch
node wipe-firestore.mjs --collections users,logs

# delete, keeping one admin so the panel stays reachable
node wipe-firestore.mjs --collections users,logs --confirm \
  --keep-email kingstonboulderingcooperative@gmail.com
```

Naming a collection that doesn't exist is an error rather than a silent no-op —
a typo would otherwise "succeed" by deleting nothing and leave you thinking the
data was gone.

### What is safe to wipe

Only two collections can be rebuilt from a CSV:

| Collection | Re-importable? |
|---|---|
| `users` | Yes — Members tab → Import CSV |
| `logs` | Purchase entries yes (Purchases tab → Import CSV); ordinary sign-ins no |
| everything else | **No.** Boulders, seasons, climb logs, gym status, badge config — none of it has an import path |

`--collections users,logs` is almost certainly what you want.

### Two things to know before running it

**Locking yourself out.** Admin access is `users/{uid}.isAdmin`, so wiping
`users` removes the records that grant it. Only `SUPER_ADMIN_EMAIL`
(`kingstonboulderingcooperative@gmail.com`), hard-coded in both
`firestore.rules` and `admin-web/index.html`, keeps working regardless. Either
sign in as that account afterwards, or pass `--keep-email` for an admin you want
preserved. The script warns when you have done neither.

**Orphans.** `logs`, `climbLogs`, `personalProblems` and `userBoulderData` all
reference member ids. Wiping `users` without them leaves those records pointing
at members who no longer exist. The script names which ones when it applies.

### After wiping

Deploy the current code *after* the wipe, not before. The panel and the app both
expect the new `membershipAccessPass` / `membershipConfirmed` fields and no
longer read the old `membershipStatus` or `accessPassStart`, so any member
document written before this change reads as holding no pass.

Firebase **Auth** accounts are untouched — this only clears Firestore. A member
whose profile you re-import by email is re-linked to their existing Google
account on their next sign-in by `findOrLinkProfile` in
`web/src/services/profiles.ts`.
