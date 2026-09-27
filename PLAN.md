# TrackItBetter — React Native Remake Plan

A cross-platform (Android + iOS) rewrite of **TrackIt** (Android/Java, Room, MPAndroidChart), rebuilt around **calisthenics and bodyweight training**, with many new features.

## 1. Why a remake
The legacy app's model is gym-centric: `Set = { int weight, int reps }`, free-text exercise type/muscle, charts of max weight only, Room schema v1 with no migrations. Calisthenics needs holds, assisted/weighted loads, leverage progressions, skill trees, timers and form checks. Retrofitting that into old Java/Fragments is more costly than a clean rewrite — and a rewrite gets iOS for free.

Guiding principles:
- **Offline-first, local-first.** Everything works with no account and no network. Sync is opt-in.
- **Logging speed is king.** A set must be loggable in ≤ 2 taps mid-workout.
- **Progressions, not just numbers.** The app should know that tuck planche → adv. tuck → straddle is progress.
- **Your data is yours.** JSON backup and restore in the MVP; CSV transfer follows in the next wave.

## 2. Tech stack
| Concern | Choice | Why |
|---|---|---|
| Framework | **Expo (SDK latest) + TypeScript strict** | Fast iteration, EAS builds, OTA updates |
| Navigation | **Expo Router** (file-based, typed routes; built on React Navigation) | Deep links, typed params |
| Local DB | **expo-sqlite + Drizzle ORM** (+ `drizzle-kit` migrations, `useLiveQuery`) | Relational data, real migrations, reactive queries |
| UI/session state | **Zustand** (active workout session, timers, settings) persisted via MMKV | Small, simple, fast |
| Forms/validation | React Hook Form + **Zod** (shared schemas for DB, import/export) | One source of truth for shapes |
| UI kit | Tamagui *or* NativeWind + custom components; light/dark themes | Performant, themeable |
| Charts | **Victory Native XL** (Skia) | Smooth charts, heatmaps via Skia |
| Animation/gestures | Reanimated 3 + Gesture Handler; Haptics | Swipe-to-complete sets, timers |
| Media | expo-camera, expo-image-picker, expo-video, expo-file-system | Form-check videos, progress photos |
| Notifications | expo-notifications (+ background timer notification) | Rest timer, reminders |
| Audio/voice | expo-audio, expo-speech | Countdown beeps, voice cues for holds/intervals |
| Health | Health Connect (Android) / HealthKit (iOS) via config plugins | Bodyweight in, workouts out |
| i18n | i18next + expo-localization (EN + IT) | |
| Testing | Jest + React Native Testing Library; Maestro for E2E | |
| Quality | ESLint, Prettier, TS strict, GitHub Actions CI, EAS Build | |
| Optional later | Supabase (auth + Postgres sync), Sentry | Only when multi-device sync is wanted |

## 3. Architecture
Feature-first folders:
```
TrackItBetter/
  app/                       # Expo Router routes (thin: compose feature screens)
    (tabs)/ today.tsx  log.tsx  progress.tsx  library.tsx  profile.tsx
    workout/[id].tsx  exercise/[id].tsx  skill/[chainId].tsx  program/[id].tsx
  src/
    db/        schema.ts  client.ts  migrations/  seed/ (exercises, chains, programs JSON)
    features/
      session/     # active workout: store.ts, timers, set logging components
      exercises/   # library, filters, exercise detail, custom exercises
      progressions/# skill trees, level criteria, unlock logic
      programs/    # templates, scheduling, auto-progression engine
      analytics/   # PRs, charts, volume, balance, heatmap
      body/        # bodyweight, measurements, photos, mobility ROM
      media/       # form-check video capture/compare
      goals/       # goals, achievements, streaks
      data/        # JSON backup and restore; CSV transfer in the next wave
      settings/
    shared/    components/ hooks/ utils/ (units, time fmt) theme/ i18n/
    domain/    # PURE TS, no RN imports: 1RM calc, effective load, PR detection,
               # progression rules, volume math → 100% unit tested
```
Rule: business logic lives in `src/domain` (pure functions) so it's trivially testable; DB access through per-feature repository modules; components stay dumb.

## 4. Data model (Drizzle / SQLite)
- **exercise** — id, name, aliases, `metric` (`reps` | `time` | `reps_load` | `time_load` | `distance`), category (push/pull/legs/core/skill/mobility/cardio), movement pattern, primary/secondary muscles, equipment[] (bar, rings, parallettes, floor, band, wall, weight vest…), unilateral, `chainId?`, `level?`, leverageFactor?, cues, demoUrl, isCustom, favourite, archived
- **progression_chain** — id, name, description, family (planche, front lever, back lever, handstand, HSPU, OA pull-up, OA push-up, pistol, muscle-up, human flag, dragon flag, L-sit/V-sit/manna, nordic curl, bridge…)
- **level_criteria** — chainId, level, target (e.g. `3×10s` or `3×8 reps`), required sessions
- **workout** — id, name, startedAt, endedAt, programDayId?, notes, readiness (sleep/energy/soreness 1–5), sessionRPE, bodyweightKg snapshot
- **exercise_entry** — id, workoutId, exerciseId, order, groupId?, groupType (superset/circuit/EMOM/AMRAP/tabata), notes
- **set** — id, entryId, index, kind (warmup/working/drop/failure/myo), reps?, durationSec?, **addedLoadKg** (+ weighted / − assisted), band?, rpe?, rir?, side (L/R/both), tempo?, restSec?, completedAt, videoId?
- **bodyweight / measurement** — date, kind (weight, waist, arm…), value
- **mobility_test** — date, test (pike, pancake, bridge, shoulder flexion, splits), value (cm/deg)
- **photo / video** — uri, takenAt, workoutId?, exerciseId?, tags
- **program / program_week / program_day / program_slot** — targets (sets × reps/hold, rest, RPE), progression rule
- **personal_record** — exerciseId, type (max reps, max hold, max load, e1RM, volume), value, setId, achievedAt
- **goal / achievement** — target, deadline, progress, unlockedAt
- **settings** — units (kg/lb), default rest, sounds, theme, language

Derived (computed in `domain/`, not stored): effective load = `bodyweight × leverageFactor + addedLoad`; bodyweight-inclusive e1RM (Epley/Brzycki); weekly volume per category/muscle; push:pull ratio.

## 5. Feature set

### MVP (parity + calisthenics core)
1. **Workout logging** — start empty/from template, add exercises, per-metric set rows (reps / hold timer / ± load), swipe to complete, copy previous set, “repeat last session”, previous performance shown inline, notes.
2. **Timers** — rest timer auto-starts on set completion (notification + lock-screen), **hold stopwatch** with countdown/beeps, interval timer (EMOM, Tabata, custom).
3. **Exercise library** — ~200 seeded calisthenics exercises with metric, category, equipment, chain/level, cues; search, filters, favourites, custom exercises.
4. **Progression chains & skill tree** — visual tree per skill, current level, unlock criteria, “progress/regress” one-tap swap in the active workout.
5. **History** — calendar + list, edit past workouts. Implemented.
6. **Progress** — metric-aware charts per exercise (max reps, max hold, max added load, e1RM), PR list with automatic PR detection. Charts, records, movement-balance insights, and a post-workout summary that celebrates new records are implemented.
7. **Bodyweight & progress photos** (parity with legacy Photos tab). Implemented with private photo storage, timeline, and before/after comparison.
8. **Workout reminders** (parity with legacy notification).
9. **JSON backup and restore** for portable data transfer. Progress photos are included; form-check videos stay local and are removed when restoring a backup.
10. Dark mode, EN/IT.

### v1.1 — Training intelligence
- **Programs**: build your own weekly program; bundled starters (beginner full-body routine, push/pull/legs, skill + strength split, GTG plan). Implemented.
- **Auto-progression engine**: when targets hit N sessions → suggest +reps, +hold time, +load, or next level. Implemented.
- **Readiness check-in** (sleep, energy, soreness) → suggest lighter day/deload. Implemented.
- **Balance insights**: push vs pull, horizontal vs vertical, legs neglect warnings; weekly volume per muscle. Implemented.
- **Grease-the-groove mode**: in-app quick logging for completed micro-sessions is implemented; notification actions and a home-screen widget remain.

### v1.2 — Media & body
- **Form-check video**: record or choose a short clip from a set, play at half speed, and compare clips for the same exercise. Clip trimming, angle overlays, and video backup remain.
- **Mobility & flexibility tracking**: standard tests (pike, pancake, splits, bridge, shoulder flexion) with trend charts; mobility routines with timers. Tests and charts are implemented; timed routines remain.
- **Measurements** (waist, arms…), photo comparison slider, photo timeline. Implemented.

### v1.3 — Motivation & ecosystem
- Goals with deadlines (“10 s straddle planche by March”), achievements/badges, streaks, **consistency heatmap**, yearly recap. Weekly session goals, derived badges, streaks, heatmap, and current-year recap are implemented; deadline-based skill goals remain.
- Home-screen widgets (today's workout, streak, rest timer) remain.
- Health Connect / HealthKit: read bodyweight, write workouts. Remains.
- Shareable workout/PR cards (image export). Implemented for completed workouts and personal bests.
- Voice cues & hands-free mode (spoken set/rest prompts). Spoken rest cues are implemented; voice-command control remains.

### v2 — Optional cloud
- Account + multi-device sync (Supabase, offline-first with conflict resolution by `updatedAt`), web dashboard.
- Share programs by link/QR.
- Optional **AI coach** (Claude API): natural-language workout summary, program suggestions from history, form-check feedback on videos. Strictly opt-in, data sent only on request.
- Wear OS / Apple Watch companion for timers and set completion.

## 6. Next wave: CSV transfer
- Add CSV export/import for workouts, exercise entries, sets, and body measurements.
- Keep CSV validation and replacement/import behavior explicit, with a preview before writes.
- JSON backup and restore remain the MVP transfer path.

## 7. Milestones
| # | Milestone | Deliverable |
|---|---|---|
| M0 | Scaffold | Expo + TS strict, Expo Router tabs, Drizzle + first migration, theme, i18n, lint/test/CI, EAS dev build |
| M1 | Domain core | `src/domain` with tests: units, effective load, e1RM, PR detection, progression rules |
| M2 | Library | Seed data (exercises, chains, criteria), library screens, custom exercises |
| M3 | Logger | Active session store, per-metric set rows, rest & hold timers, notifications, history |
| M4 | Progress | Charts, PRs, skill tree, bodyweight, photos |
| M5 | Data | JSON backup/restore → **MVP release** (internal testing track) |
| M6–M9 | v1.1 → v1.3 | Programs & auto-progression → media & mobility → goals, widgets, health |
| M10 | v2 | Sync, AI coach, watch (only if wanted) |

## 8. Verification
- **Unit**: Jest on all `src/domain` logic (target ~100% there) and DB repositories against in-memory SQLite.
- **Component**: RNTL for set row, timers, skill tree.
- **E2E**: Maestro flows — log a workout with a timed hold, a weighted pull-up and an assisted dip; verify PR + chart; export → wipe → import round-trip.
- **Manual**: dev build on a real Android device (timers in background, notifications, camera), then iOS via EAS.
- CI (GitHub Actions): typecheck, lint, tests on every PR; EAS preview builds on main.

## 9. Open decisions
- UI kit: Tamagui vs NativeWind (decide at M0 with a small spike).
- Whether cloud sync is ever needed (drives whether IDs are UUIDs from day one — **recommendation: use UUIDs anyway**).
