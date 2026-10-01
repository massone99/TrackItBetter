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

The APK name and version come from `app.json`. Bump the version with:

```sh
npm run version:bump -- patch   # or minor, major, or an explicit x.y.z
```

It updates `expo.version`, increments `android.versionCode` and `ios.buildNumber` (Android refuses to
install an update whose `versionCode` is not higher), and syncs `package.json`/`package-lock.json`.
Pushing the `app.json` change to `main` triggers the Android release workflow, which publishes
`v<version>`.

Release notes live in [CHANGELOG.md](CHANGELOG.md). Add a dated section for the new version when
bumping it, using `## <version> - YYYY-MM-DD`. The release workflow uses that version's entry as the
GitHub release description and stops if the entry is missing or empty.

The generated project signs release builds with the debug keystore, which is fine for sideloading;
use a real upload key (or `eas build -p android --profile preview`) for store distribution.

## Quality checks

```sh
npm run typecheck
npm run lint
npm test -- --ci
npx expo-doctor
```

`npm test` also runs two formal interface checks:

- `src/shared/components/__tests__/uiStandards.test.ts` parses every screen and component and fails when a
  `Pressable` has no `accessibilityRole`, a `TextInput` has no accessible name, an accessible name is
  hard-coded instead of translated, a destructive confirmation uses `Alert.alert` instead of `Sheet`, or a
  pressable `ListRow` shows a trailing icon that ignores taps.
- `src/shared/i18n/__tests__/resources.test.ts` checks that English and Italian define the same keys, that
  every `t('…')` key used in the code exists, that counted phrases have singular and plural forms, and that
  every pose position, joint and reset option is named.

## Design

"Chalk, steel, birch": a cool chalk background, steel-ink text, gym-mat blue for actions and birch for
records. Barlow Condensed carries headlines and the scoreboard numerals for reps and holds; Barlow is the
body face. Tokens live in `src/shared/theme/`, shared components in `src/shared/components/ui.tsx`.
