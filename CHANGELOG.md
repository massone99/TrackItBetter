# Changelog

Release notes for TrackItBetter, newest first.

## 0.10.1 - 2026-10-03

### Only what is relevant

- The L/R, L, R and "without side" view and the L/R comparison link on an exercise page appear only
  for exercises done one side at a time (or logged that way before); other exercises no longer show
  them.
- Record names carry their side only for those exercises, with a proper separator instead of a
  stray question mark ("Squat Jump" stays "Squat Jump"; "Split squat · L").

## 0.10.0 - 2026-10-02

### Free pose analysis

- A new "Free analysis" (group "Any exercise") for movements outside the catalogue: no position
  formula and no levels, only the joint angles you pick (shoulder, hip, elbow, knee, lean), each
  0-180 degrees on the side you choose.
- The angle in focus, else the first picked one, is drawn on the photo; the result card, history
  and overview list the picked angles instead of a value and a level. Misplaced points can still be
  dragged into place.

## 0.9.1 - 2026-10-02

### Warm-up sets

- Every exercise has an "Add warm-up" button next to "Add set". The warm-up goes after the warm-ups
  already there and before the first working set (a left/right pair for unilateral exercises), and
  stays out of statistics and records, as before. Tapping a set number still switches it between
  warm-up and working.

## 0.9.0 - 2026-10-02

### Workout blocks and a calmer workout screen

- Put each exercise of a workout in a block: warm-up, main work or mobility. Blocks stay in that
  order, get a header with their progress once any exercise leaves the main work, and a dragged
  exercise joins the block it is dropped in. A mobility exercise added to a workout of other
  exercises goes to the mobility block by itself.
- Every workout opens with its exercises folded; one added later opens so it can be logged, and
  starting an EMOM unfolds its exercise.
- The summary and readiness rows lose their cards, collapse all shares the readiness row, and
  the footer links wrap instead of squeezing their labels.
- Each set reads as one block on three aligned columns: copy last time, load and set menu under
  the set number, the reps and the check. The left or right side sits in the set badge.
- Layouts hold on narrow phones and large system fonts: font size is capped, the tab bar grows
  with its labels (they were clipped), and fixed sizes around text became flexible.

### Timers and durations

- Take 15 s off a running rest with the new −15 s button.
- The duration sheet used for holds and rests shows a large time with − and + steps, one-tap quick
  durations, minute and second wheels, and lets you type seconds or m:ss.
- EMOM rounds prefill with the value of the last completed round instead of the target.

### Mobility and totals

- Mark mobility exercises as active or passive. Training totals can be filtered to strength,
  mobility, or active/passive mobility, and in mobility each movement tag leads with the time held.

### Pose analysis

- The source buttons (photo, gallery, video) no longer fail silently, the gallery path does not ask
  for a library permission it does not need, and every failure ends in a message naming the step
  and the cause.

### Data

- Additive migrations v11 (mobility type) and v12 (workout blocks). Backups carry both; older
  backups remain importable. To return to an older app version, restore a backup made before
  migration.

## 0.8.0 - 2026-10-02

### EMOM inside a workout

- Start an EMOM from an exercise's options: rounds, interval (15 s to 5 min, 1 minute by
  default) and reps or hold per round, prefilled from the planned sets still to do.
- A 5-second countdown, beeps for the last 3 seconds and at each new round, and a bar with the
  round, the time to the next one, − / + for this round's reps and Stop. The screen stays on.
- Each round is saved as a completed set when it ends, at its real time, filling the planned
  sets first (left/right pairs for unilateral exercises). Recorded rounds keep − / + for quick
  corrections while the EMOM runs. No rest timer or RPE prompt interrupts it.
- Leaving the screen, locking the phone or closing the app loses or doubles no round: missed
  rounds are recorded on return. Alerts mark every round with the phone in standby.
- At the end the exercise note gets "EMOM 10 × 1′". Stop keeps the finished rounds.

## 0.7.0 - 2026-10-02

### Active and passive mobility, totals by type

- Mark mobility exercises as active (you move into the range with your own strength)
  or passive (gravity, load or a partner takes you there). The choice is optional and
  appears in the exercise form only while mobility is one of the categories.
- Training totals have a Strength / Mobility filter, with Active / Passive for
  mobility. In the mobility view each movement tag shows the time held first, so you
  can see the weekly minutes spent on, for example, shoulder flexion.
- Additive database migration v11 stores the mobility type. Backups carry it; older
  backups remain importable. To return to an older app version, restore a backup made
  before migration.

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
