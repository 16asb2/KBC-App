# KBC App — Production Readiness & Migration Guide

This document tracks everything that needs to happen before the app is distributed to the full
KBC membership on a production build. It is a living checklist — check items off as they are
completed and add new ones as they are discovered.

---

## Current State

The app is running in **dev mode** against a `kbc-app-dev` Firebase project and a personal
Google account acting as the calendar super-admin. All core features are built and working.
The steps below migrate it to the real KBC accounts and make it safe for wider distribution.

---

## Pre-Launch Checklist

### 1. Google Cloud — Production Project

- [ ] Create (or designate) a GCP project for production, separate from the dev project
- [ ] Enable **Google Calendar API** in the production GCP project
- [ ] Enable **Firebase / Firestore API** in the production GCP project
- [ ] Create an **OAuth 2.0 Web Client** (for user sign-in via `@react-native-google-signin`)
  - Add the production Android SHA-1 fingerprint (from the EAS keystore) as an authorized fingerprint
  - Note the **Web Client ID** → `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`
- [ ] Create an **OAuth 2.0 Desktop app Client** (for the admin refresh token — see step 4)
  - Note the client ID and secret → `EXPO_PUBLIC_GOOGLE_ADMIN_CLIENT_ID / SECRET`

---

### 2. Firebase — Production Project

- [ ] Create Firebase project `kbc-scheduler` (or confirm it already exists and is configured)
- [ ] Enable **Firestore** in production mode with appropriate security rules
- [ ] Enable **Google Sign-In** as an authentication provider
- [ ] Confirm the production **project ID** and **API key**
  - `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
  - `EXPO_PUBLIC_FIREBASE_API_KEY`

---

### 3. Google Calendar — KBC Calendar ID

- [ ] Confirm the KBC Google Calendar is owned by the official KBC Google account (not a personal account)
- [ ] Open Google Calendar → Settings → [KBC calendar] → scroll to **Calendar ID** at the bottom
- [ ] Copy the calendar ID → `EXPO_PUBLIC_GOOGLE_CALENDAR_ID`
- [ ] Confirm the calendar's sharing settings allow read access (either public or shared with all members)

---

### 4. Admin Refresh Token — KBC Google Account

This token lets the app write to the KBC calendar on behalf of the KBC super-admin account
without any user interaction. It only needs to be obtained once (unless the Desktop OAuth
client is deleted).

- [ ] Sign into the **KBC Google account** (the one that owns the KBC calendar) in a browser
- [ ] Run the token helper script from the repo root:
  ```
  node scripts/get-admin-token.js <DESKTOP_CLIENT_ID> <DESKTOP_CLIENT_SECRET>
  ```
  Use the Desktop OAuth client created in step 1.
- [ ] Follow the browser prompt — sign in as the **KBC Google account** (not your personal account)
- [ ] The script writes `EXPO_PUBLIC_GOOGLE_ADMIN_REFRESH_TOKEN` to `.env` automatically
- [ ] Copy the token value into EAS Secrets (see step 5)

> **If the Desktop client is ever deleted:** the refresh token is immediately invalidated.
> Create a new Desktop OAuth client in GCP and re-run the script to recover.

---

### 5. EAS Secrets — Replace `.env` for Production Builds

The `.env` file is local only and is gitignored. Production EAS builds need these values
stored as **EAS Secrets** so the build server can inject them.

Run once (replace values with production credentials):

```bash
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_PROJECT_ID        --value "kbc-scheduler-929e3"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_API_KEY            --value "<prod api key>"
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID      --value "<prod web client id>"
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_CALENDAR_ID          --value "<kbc calendar id>"
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_ADMIN_CLIENT_ID      --value "<desktop client id>"
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_ADMIN_CLIENT_SECRET  --value "<desktop client secret>"
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_ADMIN_REFRESH_TOKEN  --value "<token from step 4>"
```

Verify secrets are visible: `eas secret:list`

---

### 6. `app.json` / `eas.json` — Production Profile

- [ ] Confirm `eas.json` has a `production` build profile pointing to the correct EAS project
- [ ] Confirm `app.json` `android.package` matches the Play Store / distribution package name
- [ ] Confirm `android.googleServicesFile` points to the production `google-services.json`
  (download from Firebase Console → Project Settings → Your apps → Android app)
- [ ] Bump `version` and `android.versionCode` appropriately

---

### 7. Firestore — Data Migration

- [ ] Decide whether to seed production Firestore with any existing member data, or start fresh
- [ ] If migrating: export from dev Firestore, sanitize (remove test accounts), import to prod
- [ ] Run `migrateBouldersAddFields()` helper if importing boulder data from a pre-v0.3 export
- [ ] Confirm the super-admin email in `constants/admins.ts` is set to the correct production admin email before building

---

### 8. Smoke Test on Production Build

- [ ] Build a production APK: `eas build --platform android --profile production`
- [ ] Install on a test device and sign in with a real KBC member account
- [ ] Schedule tab loads events from the KBC calendar
- [ ] Supervisor can create a session — event appears in Google Calendar under the KBC account
- [ ] Member can join a session — event title updates, event ID unchanged
- [ ] Gym open/closed status reflects supervisor sign-in correctly
- [ ] Admin can manage members and access passes

---

## Credential Reference

| Env Var | Where to find it | Used for |
|---|---|---|
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Console → Project Settings | Firestore REST base URL |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Firebase Console → Project Settings → Web API Key | Firestore REST auth |
| `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` | GCP → Credentials → Web client | Google Sign-In |
| `EXPO_PUBLIC_GOOGLE_CALENDAR_ID` | Google Calendar → Settings → Calendar ID | All calendar reads/writes |
| `EXPO_PUBLIC_GOOGLE_ADMIN_CLIENT_ID` | GCP → Credentials → Desktop client | Admin token refresh |
| `EXPO_PUBLIC_GOOGLE_ADMIN_CLIENT_SECRET` | GCP → Credentials → Desktop client | Admin token refresh |
| `EXPO_PUBLIC_GOOGLE_ADMIN_REFRESH_TOKEN` | Output of `scripts/get-admin-token.js` | Admin token refresh |

---

## Notes

- The `EXPO_PUBLIC_GOOGLE_CLIENT_SECRET` (web client secret) present in the dev `.env` is **not
  used by the app at runtime** — it was a leftover from an earlier approach. It does not need
  to be added to EAS Secrets.
- The Desktop OAuth client used for the admin refresh token is only needed to run
  `get-admin-token.js` once and to refresh the token at runtime. It does not need to be
  registered as an authorized redirect URI for anything else.
- Keep the Desktop client alive in GCP — deleting it invalidates the refresh token immediately.
