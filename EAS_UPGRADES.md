# KBC App — EAS Build Upgrade List

Things currently using workarounds in Expo Go that should be upgraded
when the EAS production build is ready.

---

## 1. Waiver Documents → Real PDFs
**Current:** `services/waiver-doc.ts` creates a Google Doc via Drive REST API,
shared to `16asb2@gmail.com` (personal email, temporary).
**Upgrade to:**
- Use `expo-print` to generate a proper PDF from the same HTML template
- Use `expo-sharing` to let the user save/send the PDF
- Change `KBC_ADMIN_EMAIL` → `kbc.climb@gmail.com`
- Upload directly to **KBC's shared Google Drive folder** using a
  Google Service Account (server-side key, no user permission prompts,
  all waivers centralized in one place)
- Files: `services/waiver-doc.ts`, `constants/waivers.ts`

---

## 2. Copy Email to Clipboard (Access Pass Payment)
**Current:** Tapping `kbc.climb@gmail.com` in the payment confirmation
screen uses `Share.share({ message: 'kbc.climb@gmail.com' })` — opens
the share sheet instead of copying to clipboard.
**Upgrade to:**
- Use `expo-clipboard`: `Clipboard.setStringAsync('kbc.climb@gmail.com')`
- Show a brief toast confirming "Email copied!"
- File: `app/(tabs)/home.tsx` (the `paymentEmail` Text `onPress` handler)

---

## 3. Firestore Security Rules ⚠️ In Progress
**Current:** Temporarily open (`allow read, write: if true`) while Firebase Auth
token exchange is verified in production.
**Done:** Full per-collection strict rules written (members, logs, gym status,
boulders, climb logs, climb locations, session requests) — see `firestore.rules`
and `feat/security-hardening` branch. Firebase Auth token exchange integrated into
all service files via `services/authBridge.ts`.
**Remaining:** Verify that production builds include `Authorization: Bearer <firebase-id-token>`
on Firestore requests, then redeploy the strict rules.
See **PRODUCTION.md → Step 9** for the verification checklist.

---

## Reminder: EAS Build Steps
See conversation notes for the full EAS build walkthrough:
- Install EAS CLI, configure `eas.json`
- Run from WSL: `eas build --platform android --profile preview`
- Internal `.apk` first (no Play Store needed), then production `.aab`

---

## 4. Production Release Plan (after preview test phase)

### Step 1 — Deploy Firestore rules
The `personalProblems` collection rule was added locally but not yet deployed.
```bash
firebase deploy --only firestore:rules
```

### Step 2 — Deploy the Cloud Functions proxy
The admin calendar token proxy (`getAdminCalendarToken`) was designed in the
security hardening branch but not yet deployed to Cloud Functions. Deploy it so
the admin refresh token moves off-device.

### Step 3 — Remove `GOOGLE_CLIENT_SECRET` and `GOOGLE_ADMIN_REFRESH_TOKEN` from the app
Once the Cloud Functions proxy is live:
- Drop the `EXPO_PUBLIC_` prefix from both variables
- Remove them from Expo dashboard environment variables
- Store them as **Secret** env vars directly in Cloud Functions
- Remove all client-side references in the app bundle
- Update `EXPO_PUBLIC_CLOUD_FUNCTIONS_BASE_URL` to point to the deployed function

### Step 4 — Restrict the GCP API key
In Google Cloud Console → APIs & Services → Credentials, restrict `AIzaSy…` to:
- Android apps only: `com.kbcscheduler.app` + SHA-1 `BA:2F:DE:1E:59:DA:21:B6:D4:9A:40:CD:EC:CE:FA:A5:A7:F3:E1:7A`
This makes the key useless if extracted from the APK.

### Step 5 — Transfer super-admin to KBC account
Update `EXPO_PUBLIC_SUPER_ADMIN_EMAIL` in Expo dashboard and the hardcoded
email in `firestore.rules` (`isSuperAdmin()` function) from `16asb2@gmail.com`
to the KBC gym-owned Google account (see Step below for full Firebase migration).

### Step 6 — Production EAS build
```bash
eas build --profile production --platform android
```
Auto-increments `versionCode`.

### Step 7 — Play Store submission
```bash
eas submit --platform android
```

---

## 5. Migrate Firebase to KBC-Owned Account

The current Firebase project (`kbc-app-dev`) lives under the personal account
`16asb2@gmail.com`. Before public release, move everything to a KBC gym-owned
Google account (e.g. `kbc.climb@gmail.com`).

### Phase A — Set up the new Firebase project
1. Sign in to Firebase Console with the KBC Google account
2. Create a new Firebase project (e.g. `kbc-app`)
3. Enable **Firestore** in the new project (same region as current)
4. Enable **Authentication** → Google Sign-In provider
5. Add both Android apps:
   - `com.kbcscheduler.app` + SHA-1 `BA:2F:DE:…` (preview/production)
   - `com.kbcscheduler.app.dev` + SHA-1 `83:A3:21:…` (dev builds)
6. Download the new `google-services.json` and keep it local (gitignored)
7. Deploy `firestore.rules` to the new project:
   ```bash
   firebase use <new-project-id>
   firebase deploy --only firestore:rules
   ```

### Phase B — Migrate Firestore data
1. Export from current project using Firebase CLI:
   ```bash
   firebase use kbc-app-dev
   firebase firestore:export gs://kbc-app-dev.firebasestorage.app/migration-export
   ```
2. Import into new project:
   ```bash
   firebase use <new-project-id>
   firebase firestore:import gs://<new-bucket>/migration-export
   ```
   *(You will need Storage enabled on both projects for this)*

### Phase C — Update app credentials
1. Update all `EXPO_PUBLIC_FIREBASE_*` env vars in Expo dashboard to new project values
2. Update `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` to the new project's web client ID
3. Update `EXPO_PUBLIC_SUPER_ADMIN_EMAIL` to the KBC account email
4. Update the hardcoded email in `firestore.rules` (`isSuperAdmin()`)
5. Update `EXPO_PUBLIC_GOOGLE_CALENDAR_ID` if the KBC calendar moves to the new account
6. Re-run `eas build` to bake the new credentials into the APK

### Phase D — Cut over and decommission
1. Point all active users to the new build (force-update via Play Store or
   distribute new APK internally)
2. Verify sign-in, Firestore reads/writes, and calendar integration all work
3. Revoke the old project's OAuth clients in GCP Console
4. Delete or archive the `kbc-app-dev` Firebase project
