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
