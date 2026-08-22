# KBC App 🧗

The official app for the **Kingston Bouldering Cooperative** — a member-managed climbing gym in Kingston, ON. It supports gym operations and gives local climbers useful tools to stay connected with the community.

> **Status:** The app is a **web app (PWA)** — installable to a phone home screen, no app store involved. It lives in [`web/`](./web/).
>
> An earlier Expo/React Native version lives in [`mobile/`](./mobile/). **It was never released** and has no users; it's kept as a porting reference while `web/` closes its last feature gaps, then it goes away. See [WEB-MIGRATION-PLAN.md](./WEB-MIGRATION-PLAN.md) for the background.

---

## Tech Stack

- **Framework:** [Vite](https://vite.dev) + React + TypeScript
- **Styling:** [Tailwind CSS](https://tailwindcss.com)
- **Routing:** React Router
- **Backend:** Firebase — Firestore (via the modular [Firebase JS SDK](https://firebase.google.com/docs/web/setup)), Firestore Security Rules
- **Auth:** Firebase Auth, Google sign-in via `signInWithPopup`
- **PWA:** `vite-plugin-pwa` (Workbox) — manifest, service worker, offline app shell
- **Hosting:** Firebase Hosting, deployed by GitHub Actions

**Google Calendar access** is mediated through a Cloudflare Worker ([`worker/`](./worker/)) that holds the KBC admin account's OAuth credentials, so no client ever does.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- Access to the KBC Firebase project (ask a team member) and a `web/.env` — see [`web/.env.example`](./web/.env.example) for the keys it needs

```bash
cd web
npm install
npm run dev
```

Opens at `http://localhost:5173`. Other commands:

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run lint` | ESLint |
| `npm run test` | Unit tests (Vitest) |
| `npm run build` | Type-check + production build |
| `npm run preview` | Serve a production build locally |

See [web/CLAUDE.md](./web/CLAUDE.md) for architecture notes and current feature status.

---

## Project Structure

```
web/          — the app (routes in web/src/pages/, wired up in web/src/App.tsx)
mobile/       — retired, unreleased Expo app; porting reference only
admin-web/    — legacy standalone admin panel (single HTML file), still live
worker/       — Cloudflare Worker mediating Google Calendar admin access
firestore.rules — shared Firestore security rules
DESIGN.md     — product/architecture decisions and open questions
WEB-MIGRATION-PLAN.md — how the app got from Expo to web
CHANGELOG.md  — project-wide history
```

---

## Deployment

Pushes to a PR deploy `web/` to a temporary Firebase Hosting **preview channel** (URL posted as a PR comment); merges to `main` deploy **live**. Both are handled by [`.github/workflows/deploy-web.yml`](./.github/workflows/deploy-web.yml) and only ever touch the `web` hosting target — `admin-web/`'s site is untouched.

---

## Contributing

This is an internal project for the KBC team. Branch off `main` (`feat/`, `fix/`, `chore/`, `refactor/` prefixes, conventional commits) and open a PR when ready. Architecture decisions belong in `DESIGN.md`; user-facing changes in `CHANGELOG.md`.

---

## Resources

- [Vite Docs](https://vite.dev/) · [React Docs](https://react.dev/) · [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Firebase Docs](https://firebase.google.com/docs)
- [Kingston Bouldering Cooperative](https://kingstonbouldering.com)
