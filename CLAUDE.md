# TrackItBetter: notes for Claude

Expo SDK 57 / React Native, Android-first, offline (SQLite + drizzle). The owner writes in Italian and
wants short answers. Product context: `PRODUCT.md`, `DESIGN.md`.

## Release flow (always merge to `main` and release)

- `npm run version:bump -- patch|minor` edits app.json, package.json and the lock file.
- The "Android release" workflow refuses a version without a `CHANGELOG.md` entry (`## x.y.z - date`).
  Add it before pushing. A push to `main` that touches app.json builds the APK (about 15 min) and
  publishes `vX.Y.Z`.
- Other sessions also push to `main` (the owner runs several). Before every push:
  `git fetch origin main`, merge it, and expect conflicts in app.json, package.json and
  package-lock.json (take main's version, then bump again). Never assume local `main` is current.
- Checks that CI runs: `npm run typecheck`, `npm run lint`, `npm test -- --ci`. Run them first.

## Android picker bug (fixed in 0.10.3)

- Symptom: "Attempting to launch an unregistered ActivityResultLauncher" from expo-image-picker
  (also expo-document-picker). Android destroys and recreates the activity while the app process
  stays alive; expo-modules-core unregisters the launcher and never registers it again.
- Fix: `patches/expo-modules-core+57.0.19.patch` (applied by `postinstall: patch-package`) makes
  `launch()` re-create the request code. Never install with `--ignore-scripts`. When
  expo-modules-core changes version, check whether the bug is fixed upstream, else regenerate the
  patch (`npx patch-package expo-modules-core`).
- The prebuilt manifest already lists every `configChanges` value, so the config plugin
  `plugins/withMainActivityConfigChanges.js` changes nothing; it is harmless and can be removed.
- `src/shared/media/pickerErrors.ts` turns the raw error into a "close and reopen the app" message.

## Verifying UI

- No emulator here. Use Expo web: `CI=1 npx expo start --web --port 8081 --clear` (restart with
  `--clear` after adding files) and Playwright driven with Chromium `--no-sandbox`. Each run has an
  empty database, so create the data in the same script.
- Pose analysis (`app/pose/new.tsx`) does not run on web (`poseDetectionAvailable` is false), so it
  can only be checked with unit tests and on a phone.
- Native-only behaviour (pickers, gestures, timers in the background) can only be confirmed by the owner.

## Conventions

- Portrait only (`orientation: portrait` is a product decision; do not unlock it).
- Colours from `src/shared/theme/palette.ts` only; touch targets at least 48 dp (hitSlop counts);
  text at least 12 sp; no fixed heights on text containers (users scale fonts).
- Long lists render in pages ("Show more"), not all at once.
- i18n: en and it in `src/shared/i18n/resources.ts`. A string with `{{count}}` needs `_one` and
  `_other` keys (a test enforces it); do not put `{{count}}` in a non-plural key.
- Lint uses the React Compiler rules: no ref reads or writes during render, no setState in effects,
  declare functions before use.
- Drag to reorder (`ReorderableList`) moves rows with Reanimated shared values; keep per-frame work
  out of React state. Tests mock `react-native-reanimated` and `react-native-gesture-handler`
  (see `app/__tests__/programBuilder.test.tsx`).
- Tests that render components need `jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'))`.
