# Changelog

Release notes for TrackItBetter, newest first.

## 0.6.15 - 2026-10-02

### Unilateral L/R sets

- Edit the unilateral flag on built-in and custom exercises. New sets are linked
  left/right pairs with independent reps, holds, distance, load, RPE, notes and videos.
- A completed pair counts as one set. Finish is blocked when only one side is done;
  the saved draft identifies the missing exercise, set and side. Fully skipped pairs
  are excluded. Warm-up changes, removal and undo act on the whole pair.
- Choose rest after each side or after the pair (default), with an exercise preference
  and a current-workout override. Supersets advance after both sides; hold timers
  keep each side's actual time.
- Programs, repeat workouts, micro-sessions and guided mobility use the same pairs.
  Three prescribed sets create three pairs; saving as a program keeps that count.
- Statistics average real side contributions: 10×20 kg and 8×15 kg count as
  160 kg·rep. Derived estimates are calculated per side before averaging. Pair RPE
  is unknown unless both sides have RPE. Best sets use one actual pair.
- Exercise analysis offers L/R average, L, R and a shared-scale L/R comparison.
  Same-load comparisons require equal loads in the averaged pair; side views retain
  signed load, including assistance. Records compare within the same scope.
- Convert history explicitly using an atomic pair editor, assigning the original
  row to a side while preserving its notes and videos. Legacy rows and unlinked L/R
  sets retain their previous counts until explicitly converted.
- Additive database migration v10 stores pair identity and rest preferences without
  rewriting historical performances. Backup v3 carries them; v1/v2 remain importable.
  To return to an older app version, restore a backup made before migration.

## 0.6.14 - 2026-10-01

### Organize the exercise library your way

- Independently enable or disable grouping by **main category**, **movement group**,
  and **movement tag**. Combine the groupings, or turn them all off for an
  alphabetical list.
- Group mobility exercises by movement tag, just like the rest of the library.
- Remember grouping choices on the device and share them between the library and
  exercise pickers.
- Browse the full set of matching exercises in the picker, removing its previous
  80-result limit. Search, category filters, favourites, and exercise actions
  remain available.

### Assign multiple movement tags

- Associate several movement tags with any exercise, including built-in and
  custom movements.
- Add tags through search or the existing joint and region sections; remove
  individual selections by tapping their selected chips.
- See all associated tags on the exercise page and in exercise lists. When tag
  grouping is enabled, an exercise appears under each of its tags; the result
  count still counts each exercise once.
- Include every associated tag in training statistics. A set contributes to each
  relevant tag, while the overall total counts the set once.

### Keep your existing data

- Automatically carry existing single movement tags into the new tag lists.
- Keep workout history, records, and the existing tracking options available.
- Continue importing older JSON backups; new backups preserve all movement tags.
- Exercises without tags remain visible in a dedicated group.

**Android APK:** `TrackItBetter-0.6.14.apk` · ARM64 (`arm64-v8a`) · version code **37**.
The APK uses the same signing certificate as `0.6.13` and can be installed as an
update to that version.

## 0.6.13 - 2026-10-01

### A more consistent interface

- Refine typography, spacing, navigation, forms, and shared controls across the
  app, with consistent styling in light and dark themes.
- Improve the presentation of training, progress, programs, mobility, and body
  tracking screens while retaining their existing information and actions.

### Track reps at the same weight

- Add a reps-at-weight analysis to exercise details and the single-exercise view
  in Statistics, alongside the existing analysis options.
- Select a weight and follow the best set or total reps across completed sessions.
  Added load, zero load, and assistance remain separate.
- View six-session chart pages, contributing sets, changes from the previous
  session at that weight, and links to the corresponding workouts.

### Faster workout controls and duration editing

- Add **Collapse all / Expand all** to workouts in progress. Completing an
  exercise still folds it; adding or reopening a set unfolds it. Folding keeps
  running timers active.
- Use a shared minute-and-second editor for precise duration entry, with presets,
  adjustment buttons, and explicit Save and Cancel actions.
- Make duration editing consistent across active and past workouts,
  micro-sessions, program targets, mobility routines, and rest settings.

**Android APK:** `TrackItBetter-0.6.13.apk` · ARM64 (`arm64-v8a`) · version code **36**.
