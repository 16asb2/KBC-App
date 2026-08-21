# KBC App 🧗

The official app for the **Kingston Bouldering Cooperative** — a member-managed climbing gym in Kingston, ON. This app supports gym operations and gives local climbers useful tools to stay connected with the community.

> **Status:** Mid-migration from a native Expo app to an installable web app (PWA). Both currently live in this repo — see [WEB-MIGRATION-PLAN.md](./WEB-MIGRATION-PLAN.md) for the full plan and current phase-by-phase status.

---

## Tech Stack

| | `mobile/` (Expo app) | `web/` (new PWA) |
|---|---|---|
| Framework | [Expo](https://expo.dev) (React Native) | [Vite](https://vite.dev) + React + TypeScript |
| Styling | React Native `StyleSheet` | [Tailwind CSS](https://tailwindcss.com) |
| Routing | Expo Router (file-based) | React Router |
| Firestore access | Hand-rolled REST client (Firebase SDK is incompatible with React Native's New Architecture) | Modular [Firebase JS SDK](https://firebase.google.com/docs/web/setup) |
| Auth | Google Sign-In via `@react-native-google-signin/google-signin`, exchanged against Identity Toolkit | Firebase Auth `signInWithPopup` |

**Shared backend** (used by both apps, plus `admin-web/`): Firebase project `kbc-app-3307b` — Firestore, Cloud Functions, Firestore Security Rules. Google Calendar writes are always mediated through a Cloud Function (`functions/getAdminCalendarToken`) so no client ever holds the KBC admin account's OAuth credentials.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20 (LTS recommended)
- Access to the KBC Firebase project (ask a team member) and a local `.env` for whichever app you're working on — see each app's `.env.example`

### `mobile/` — the Expo app

```bash
cd mobile
npm install
npx expo start
```

From there you can open the app in:
- [Expo Go](https://expo.dev/go) on your phone
- An [iOS Simulator](https://docs.expo.dev/workflow/ios-simulator/)
- An [Android Emulator](https://docs.expo.dev/workflow/android-studio-emulator/)

`mobile/` is frozen at feature parity — new feature work happens in `web/` going forward; `mobile/` still gets deploys/fixes as needed. See [mobile/CLAUDE.md](./mobile/CLAUDE.md) for its architecture notes.

### `web/` — the PWA

```bash
cd web
npm install
npm run dev
```

Opens at `http://localhost:5173` by default. Other commands: `npm run lint`, `npm run test`, `npm run build`. See [web/CLAUDE.md](./web/CLAUDE.md) for its architecture notes and current feature status.

---

## Project Structure

```
mobile/       — the Expo/React Native app (file-based routing via Expo Router, screens in mobile/app/)
web/          — the new Vite/React PWA (routes in web/src/pages/, wired in web/src/App.tsx)
admin-web/    — legacy standalone admin panel (single HTML file), slated for retirement into web/
functions/    — Firebase Cloud Functions shared by all clients above
worker/       — a Cloudflare Worker; status/ownership relative to functions/ unconfirmed
firestore.rules — shared Firestore security rules
DESIGN.md     — product/architecture decisions and open questions
WEB-MIGRATION-PLAN.md — the phased plan for the Expo → web migration, and its current status
CHANGELOG.md  — project-wide history
```

---

## Contributing

This is an internal project for the KBC team. If you're picking up a new feature or fixing a bug, branch off `main` (`feat/`, `fix/`, `chore/`, `refactor/` prefixes, conventional commits) and open a PR when ready. Architecture decisions belong in `DESIGN.md`; user-facing changes belong in `CHANGELOG.md`.

---

## Resources

- [Expo Docs](https://docs.expo.dev/)
- [Vite Docs](https://vite.dev/)
- [React Docs](https://react.dev/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Firebase Docs](https://firebase.google.com/docs)
- [Kingston Bouldering Cooperative](https://kingstonbouldering.com)
