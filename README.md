# TrackItBetter

Offline-first Expo app for calisthenics and bodyweight training (Android, iOS, and a web preview). Log reps, holds and added or assisted load; follow progression chains; track records, bodyweight, photos, measurements and mobility; everything stays on the device, with JSON backup and restore.

## Requirements

- Node.js 22.13 or newer
- npm
- Expo Go for the JavaScript shell, or an EAS development build for native modules

## Start

```sh
npm install        # also applies patches/ via patch-package
npm start          # then press a (Android), i (iOS) or w (web)
```

The first launch creates `trackitbetter.db` and loads the bundled movement catalog.

### Web preview

The web build runs SQLite in a worker and needs cross-origin isolation. `metro.config.js` sets the
`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers for the dev server; a static host
serving `npx expo export -p web` must send the same headers. `patches/expo-sqlite+*.patch` fixes an
upstream bug where synchronous web query results longer than 255 bytes were truncated.

## Build an Android APK

Needs JDK 17 and the Android SDK (with `ANDROID_HOME` set). `android/` is generated, not committed:

```sh
npm run build:apk
# → build/TrackItBetter-<version>.apk
```

`scripts/build-apk.sh` regenerates `android/`, clears stale native build caches in `node_modules`, and
builds for `arm64-v8a` only with compressed native libs to keep the APK small. For other ABIs (e.g. an
x86_64 emulator) run `ABIS=x86_64 npm run build:apk`.

The generated project signs release builds with the debug keystore, which is fine for sideloading;
use a real upload key (or `eas build -p android --profile preview`) for store distribution.

## Quality checks

```sh
npm run typecheck
npm run lint
npm test -- --ci
npx expo-doctor
```

## Design

"Chalk, steel, birch": a cool chalk background, steel-ink text, gym-mat blue for actions and birch for
records. Barlow Condensed carries headlines and the scoreboard numerals for reps and holds; Barlow is the
body face. Tokens live in `src/shared/theme/`, shared components in `src/shared/components/ui.tsx`.
