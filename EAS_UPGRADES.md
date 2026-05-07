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

## 3. Firestore Security Rules
**Current:** Firestore is in test mode — open read/write to anyone with
the API key.
**Upgrade to:** Lock down rules to authenticated users only before
shipping to real climbers. Basic rules:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    match /logbook/{entry} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```
Note: since we use REST API with an API key (not Firebase Auth SDK),
this may also require switching to Firebase Auth token exchange.
Coordinate with the EAS build setup.

---

## Reminder: EAS Build Steps
See conversation notes for the full EAS build walkthrough:
- Install EAS CLI, configure `eas.json`
- Run from WSL: `eas build --platform android --profile preview`
- Internal `.apk` first (no Play Store needed), then production `.aab`
