# TrackItBetter: notes for Claude

Expo SDK 57 / React Native, Android-first, offline (SQLite + drizzle). The owner writes in Italian and
wants short answers. Product context: `PRODUCT.md`, `DESIGN.md`. Vocabulary (prescribed workout vs
workout, versioned): `docs/LANGUAGE.md`; use it in UI strings, code and answers.

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
  empty database, so create the data in the same script. The dev server may not send the
  cross-origin isolation headers on the HTML page (SQLite then fails with "SharedArrayBuffer is not
  defined"); add them in Playwright with `page.route` (`cross-origin-embedder-policy: credentialless`,
  `cross-origin-opener-policy: same-origin`). In dev builds on web, `globalThis.__seed(count, active)`
  (`src/dev/webSeed.ts`) creates two programs and `count` finished workouts; call it in chunks of
  about 8 (big batches hit "Sync operation timeout"). `__time(__loads.today)` times a data load.
- Pose analysis (`app/pose/new.tsx`) does not run on web (`poseDetectionAvailable` is false), so it
  can only be checked with unit tests and on a phone.
- Native-only behaviour (pickers, gestures, timers in the background) can only be confirmed by the owner.

## Conventions

- Portrait only (`orientation: portrait` is a product decision; do not unlock it).
- Colours from `src/shared/theme/palette.ts` only; touch targets at least 48 dp (hitSlop counts);
  text at least 12 sp; no fixed heights on text containers (users scale fonts).
- Long lists render in pages ("Show more"), not all at once: `usePaged`, `usePagedSections` or `<Paged>`
  (`src/shared/components/paging.tsx`). The Log pages in the database (`listWorkoutsPage`, a cursor).
- Open improvements and their status are in `AUDIT.md`.
- Main actions of long screens go in `Screen`'s `footer` (`FooterAction`, at most two, never a
  destructive one), so they are reachable without scrolling to the end.
- Editing screens save on the way out with `useSaveOnLeave` (`src/shared/forms`); invalid edits ask
  or are dropped. `NumberEdit` saves after a short pause in typing, and at once on blur or unmount.
- Sets carry `target_rpe` (from programs: `rpe` or `rpePerSet`, see `targetRpeFor`) and a
  `form_rating` 1–5 (schema v15; `exercise_entry.form_rating` from v14 is legacy and unused). An
  exercise folds only when every set is done and every working set is rated (`exerciseFinished`).
  "Vs last time" (total, average rest, average form) is `compareWithLast` in `src/domain/lastTime.ts`,
  shown by `LastTimeStrip` in the workout and in the summary; only a lower form shows red ↓.
- Analytics read the finished history through `cachedUntilHistoryChange` (`src/db/cache.ts`), which
  reloads only after `bumpFinishedVersion()`. Any new write that can change a finished workout, its
  sets or an exercise's name/measure/categories must call it after committing (session repository
  helpers do it via `bumpIfFinished`); live-workout writes must not. The React Compiler is on
  (`experiments.reactCompiler`).
- i18n: en and it in `src/shared/i18n/resources.ts`. A string with `{{count}}` needs `_one` and
  `_other` keys (a test enforces it); do not put `{{count}}` in a non-plural key.
- Lint uses the React Compiler rules: no ref reads or writes during render, no setState in effects,
  declare functions before use.
- Drag to reorder (`ReorderableList`) moves rows with Reanimated shared values; keep per-frame work
  out of React state. Tests mock `react-native-reanimated` and `react-native-gesture-handler`
  (see `app/__tests__/programBuilder.test.tsx`).
- Tests that render components need `jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'))`.

## UX and UI principles (owner's standing brief)

Apply these to every screen you touch; the measurable targets are in `src/shared/theme/tokens.ts`.

| Property | Target |
| --- | --- |
| Android touch targets | at least 48 x 48 dp (`MIN_TOUCH_TARGET`; `hitSlop` counts) |
| Normal / large text contrast | at least 4.5:1 / 3:1 (check both light and dark palettes) |
| Font scaling | layouts survive up to 200 % (wrap, `minHeight`, never fixed heights on text); `MAX_FONT_SCALE` is 1.4 today |
| Primary navigation | 3 to 5 destinations |
| Spacing | the `spacing` scale in tokens.ts (4 / 8 / 12 / 16 / 20 / 24), never ad hoc values |
| Animation | short and purposeful; honour reduced motion (`useAnimationSettings`, `useReducedMotion`) |

- Treat every screen as a state machine: loading, empty (with a first step), error (with retry),
  saving, saved, offline, validation error, permission denied. Every action needs an observable
  outcome and a recovery path when it fails.
- Build on shared tokens and components (`src/shared/components/ui.tsx`, `src/shared/theme`), not
  per-screen styling. Shared patterns for loading, empty and error states.
- Optimise the core journey first (logging a set in a couple of taps) before animation or custom
  components. Rich detail stays one tap away, never competing with the primary action.
- A held press on a set row opens the same menu as its three dots (active and completed workouts).
  Controls that own a long press keep it: the stepper buttons (hold to repeat) and the timed-set
  play button (hold to mark done without the timer).
- `src/shared/components/__tests__/uiStandards.test.ts` enforces accessibility roles and translated
  labels; a container `Pressable` that only forwards a long press uses `accessible={false}` and
  `accessibilityRole="none"`.
- References worth consulting: Material Design 3, Apple HIG, Nielsen's 10 heuristics, WCAG 2.2.
  Validate with real users when possible: about five per iteration, realistic tasks, track
  completion, time, errors and confusion.
- Visual language (the owner's 12 concepts, applied at design-system level): hierarchy, type scale,
  whitespace and rhythm come from `tokens.ts`; depth is `elevation.surface` via `useSurfaceDepth()`
  (light theme only); press feedback is `usePressScale()` (skipped under reduced motion); moments of
  arrival use `Arrive`. Prefer these shared pieces over per-screen shadows or animations. Skip
  glassmorphism, heavy shadows and decorative loops; typography, composition, spacing and colour
  matter most.
