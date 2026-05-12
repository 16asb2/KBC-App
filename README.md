# KBC App 🧗

The official app for the **Kingston Bouldering Cooperative** — a member-managed climbing gym in Kingston, ON. This app supports gym operations and gives local climbers useful tools to stay connected with the community.

> **Status:** MVP — actively in development

---

## Tech Stack

- **Framework:** [Expo](https://expo.dev) (React Native)
- **Backend:** Firebase (Firestore, Cloud Functions)
- **Auth:** Google Sign-In via Firebase Authentication

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- Access to the KBC Firebase project (ask a team member)

### Install dependencies

```bash
npm install
```

### Start the development server

```bash
npx expo start
```

From there you can open the app in:
- [Expo Go](https://expo.dev/go) on your phone
- An [iOS Simulator](https://docs.expo.dev/workflow/ios-simulator/)
- An [Android Emulator](https://docs.expo.dev/workflow/android-studio-emulator/)

---

## Project Structure

This project uses [file-based routing](https://docs.expo.dev/router/introduction) via Expo Router. All screens live inside the `app/` directory.

---

## Contributing

This is an internal project for the KBC team. If you're picking up a new feature or fixing a bug, branch off `main` and open a PR when ready.

---

## Resources

- [Expo Docs](https://docs.expo.dev/)
- [Firebase Docs](https://firebase.google.com/docs)
- [Kingston Bouldering Cooperative](https://kingstonbouldering.com)