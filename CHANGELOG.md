# Changelog

Release notes for TrackItBetter, newest first.

## 0.19.1 - 2026-10-06

- Micro-session: no exercise is chosen for you any more; the picker opens on arrival so you pick the exercises yourself.

## 0.19.0 - 2026-10-06

- Micro-session: the same exercise card as a workout (set numbers, steppers, ✓, RPE, form, add set or warm-up, swipe, set menu). Exercises come from the picker or the recent chips; "Log N sets" saves only the checked sets; leaving with checked sets logs them.
- One set menu for the workout in progress and a finished workout.
- Workout: the rest countdown no longer re-renders the whole screen every second; screen readers hear "10 seconds left" and the end instead of every tick; a one-set workout under three minutes offers "Discard" when finishing; a failed load or discard shows a message with retry.
- Faster: live set edits no longer re-read the whole history for records and statistics; starting a program writes all sets in one go; "last time" reads only the latest session; the exercise page loads only what it shows.
- Safer: repeating a workout and starting a template program never leave a half-built workout; clip files of removed sets are deleted once undo is no longer possible, and leftovers are swept at start.
- Error states with retry on programs, workout summary and pose history; errors shown for exercise hide/delete/transfer, "Add to workout", "Repeat last" and program starts.
- Goals, progress, training statistics, measurements and template programs are fully translated (correct singular/plural); hard-coded colours moved to palette tokens; swipe labels readable in dark mode; progress photos are stored at up to 1600 px.

## 0.18.0 - 2026-10-06

- Profile → About shows the installed version and build.
- Log: compact rows (name, then day · minutes · sets) under month headers instead of cards; the calendar shows one week until "Show month"; workouts are read from the database page by page, so older workouts (beyond the latest 365) appear again in the list and on the calendar.
- Micro-session: add several exercises, each with its own set and RPE, and log them together in one micro-session.
- Long lists render in pages with "Show more": exercise library and picker, pose analyses, progress photos, statistics drill-down and training statistics.
- Workout fixes: holding + or − no longer loses steps; "Repeat workout" no longer copies last time's RPE and form; an unfinished L/R pair and one-sided rest options are translated; stepper buttons say what they change; readiness and fold controls reach 48 dp.
- Other fixes: progress photos keep the day they were taken; a failed save at the end of a mobility session can be retried; default workout names follow the app language; "Delete workout" is red again.
- `AUDIT.md` lists the remaining improvements by impact.

## 0.17.1 - 2026-10-05

- Free pose analyses: the page shows one exercise's analyses at a time, with a row to switch exercise (unlinked analyses form their own group). The confusing "Only … / Show all" filter is gone, so the analysis on show, the comparison and the list always belong to the same exercise.

## 0.17.0 - 2026-10-05

- A finished workout's page now looks and works like the workout in progress: the same flat exercise sections and set rows (steppers for reps and kg, RPE and form chips, ✓ to mark done, ⋮ or a held press for the set menu, swipe to complete or remove, tap the number to make it a warm-up). Exercises open folded to their results. Done sets stay editable in place.
- "Repeat workout" sits in the footer next to "Add exercise"; saving to a program, exporting the image and deleting are at the end of the page. Converting a set to L/R moved to the set menu.
- Under the hood: the exercise section is one shared component (`ExerciseCard`) for both screens.

## 0.16.2 - 2026-10-05

- Pose analyses are compared only with analyses of the same exercise (unlinked ones with each other); while comparing, the list shows only those.

## 0.16.1 - 2026-10-05

- New mini PR: the same work as last time (same sets, reps or time and load, rest no longer, form no worse) at a lower average RPE. "Vs last time" shows an "Average RPE" cell when last time had an RPE on every set, and the summary lists it under "Better than last time".

## 0.16.0 - 2026-10-05

- Statistics: "Average RPE" counts an exercise in a workout only when every one of its sets there has an RPE.
- Pose analyses: compare any two analyses side by side, with each picked joint angle and its change; tap an analysis in the list to set it against the one on show.
- Exercise page: a "Pose analyses" section opens the exercise's analyses (compare, relink, delete) and starts a new one already linked to the exercise.

## 0.15.1 - 2026-10-05

- Today: "New pose analysis" opens a free analysis directly, ready to link to an exercise.
- A pose analysis has a date (today by default, or the day of the linked set's workout), so older photos and videos land on the right day.

## 0.15.0 - 2026-10-05

- Free pose analyses can be linked to an exercise and to one of its sets (from the current or recent workouts), when saving or later from the analysis history.
- From a set's menu: "Analyse pose" starts a free analysis already linked to that set; a set with analyses shows their count and opens them. A clip's "analyse pose" links to its set too.
- The exercise page lists its linked analyses; the history can be filtered to an exercise or a set, and any analysis in it can be opened.
- Fixed: backups failed to export when they held a free analysis.

## 0.14.3 - 2026-10-05

- Set rows: the ✓ and ⋮ buttons no longer share touch area (⋮ used to catch taps meant for ✓); the row is slightly tighter so the steppers fit on narrow phones.

## 0.14.2 - 2026-10-05

- Workout tracker touch fixes: completing, reopening, RPE and form ratings respond at once; a double tap on ✓ no longer undoes the set; reopening the last set also stops its rest; a finished exercise folds after a short pause instead of under your finger; swipes need a clearer sideways drag, so taps on steppers are not taken as swipes; ✓ buttons show press feedback.

## 0.14.1 - 2026-10-05

- Average form is now a metric in Statistics (by workout, day, week or month, per exercise); the separate chart on the exercise page is removed.

## 0.14.0 - 2026-10-05

- Each exercise's page has a "Form over time" chart: the average form of the rated sets, session by session. Tap a bar to see that session's ratings and the change from the session before (green ↑ better, red ↓ worse), and open the workout.

## 0.13.2 - 2026-10-05

- A folded exercise shows its average form with the trend on one line: "Average form 4 ↑" in green when better, "↓" in red when lower.

## 0.13.1 - 2026-10-05

- Form is rated set by set: a "Form 1–5" row appears under each set once it is done (also in the set menu and in past workouts). Ratings given per exercise in 0.13.0 are moved onto its sets.
- An exercise folds only after the form of its last set is rated.
- The comparison with last time is explicit: "Vs last time · date" with a "Show sets" button, and cells that read "8 today / last time 26" for total, average rest and average form. Better is green with ↑; a lower average form is red with ↓.
- Today's blue card no longer animates in.

## 0.13.0 - 2026-10-05

- Programs can set a target RPE for each movement: the same for every set, or set by set. The program shows it as "4 × 8 @ RPE 8".
- In the workout the target is the dashed value in each set's RPE row; choosing a harder RPE than planned gets an amber edge.
- Each exercise compares this session with the last one: total reps (or seconds), average rest set on the sets, and form. A beaten value turns green with an arrow; tap the strip to see last time's sets.
- Rate the form of each exercise from 1 to 5 once you have done a set (also in past workouts).
- The workout summary lists what went better than last time, and folded exercises show their mini PRs.

## 0.12.1 - 2026-10-05

- Micro-sessions use the same set row as workouts: value with − and +, added load in kg, and the RPE strip; the ✓ logs it. Load and RPE are saved with the set.

## 0.12.0 - 2026-10-05

- Workout screen redesigned: exercises are flat sections instead of cards, and every set has two rows: reps (or time) and kg, then RPE.
- Every set can carry added load or assistance (kg with − and +). Adding load to a bodyweight exercise makes it track load from then on; its reps and hold records stay.
- RPE is always one tap away: a row of values 6–10 under each working set, scrolling sideways and opening around 7–8. Profile can hide it.
- The next set of each exercise has the filled ✓ button, so it is easy to spot.
- The rest timer sits above Add exercise and Finish instead of covering them.
- Clearer details: "Last time" and folded results show left and right sides separately, results carry units, and the voice cues button has a label.
- "Copy last time" moved to the set menu (⋮).

## 0.11.0 - 2026-10-05

- Today is simpler: one main card with the next workout of the program you trained last (or the one in progress), your week at a glance, a personal best only when it is from this week, and quick actions. The numbers and the list of records stay in Progress.
- Main actions stay pinned at the bottom: Add exercise and Finish in a workout, Save in the program and movement editors, Add exercise in a past workout, Add to workout on a movement, and Start next on a program.
- Leaving the program editor saves valid changes on its own; it only asks when something needs fixing. A bodyweight or measurement typed but not saved is recorded when you go back.
- Set values save shortly after you stop typing instead of on every key.
- Faster everywhere: statistics are read once and reused until something changes, new database indexes, fewer queries when a workout opens, and automatic memoization of screens.

## 0.10.10 - 2026-10-05

- Drag the grip on a workout in a program to reorder its workouts.

## 0.10.9 - 2026-10-04

- Editing a movement now saves automatically when you go back; invalid changes are discarded.

## 0.10.8 - 2026-10-04

- Long press an exercise name to open the exercise from stats, training totals, progress, today, workout summary and quick session.

## 0.10.7 - 2026-10-04

### Depth, touch feedback and a proper finish

- Cards, grouped lists and empty states lift off the page with a soft shadow in the light theme; the
  dark theme keeps its border and tone, where shadows would not show.
- Buttons, chips and icon buttons shrink slightly under the finger. With reduced motion (system or
  app setting) the shrink is skipped.
- The finished-workout badge grows into place with a soft spring (still, with reduced motion), and
  a session with a personal best is titled "New personal best" instead of the generic title.

## 0.10.6 - 2026-10-04

### Hold a set to open its menu

- A held press on a set (active workout and completed workout) opens the same menu as its three dots:
  on the number, the value, the check, or the empty parts of the row. The stepper buttons keep
  hold-to-repeat and the timed-set play button keeps hold-to-mark-done.
- The project notes now carry the owner's UX and UI principles (48 dp targets, contrast, font
  scaling, spacing scale, reduced motion, screen states).

## 0.10.5 - 2026-10-03

### Pose analysis: more of the frame, less around it

- With a photo or video loaded, the position and side fold into one line ("Front split · Left");
  "Change" opens them again. The how-to text is gone once there is a frame to look at, so the frame
  starts higher on the screen.
- Video frames: step to the previous or next frame with the arrows, see "Frame at 7.9 s, 4 of 9",
  and use the "Best frame" chip to let the app pick the frame with the best reading.
- "Save check" stays pinned at the bottom of the screen, however long the page gets.
- Warnings about uncertain joints or no body found are now a clear warning line with an icon; the
  undo and reset actions are small chips instead of full-width buttons.
- Display options (skeleton, whole body, main measure, all angles) fold behind "Display" so the
  angle chips are the only controls next to the frame.
- The result card no longer repeats the angles already shown on the chips.

## 0.10.4 - 2026-10-03

### A calmer pose analysis screen

- The joint angles you measure now sit right under the frame being evaluated, each chip showing its
  live angle in degrees and its colour. Tap to add an angle (it shows on the photo), tap again to
  show it, once more to remove it.
- With a video, the frame strip comes first with the selected time, "Find my best position" is a
  chip beside it, and the strip scrolls to the frame that was picked for you.
- Once a photo or video is loaded, the camera, photo and video buttons shrink to one slim row so
  the frame and its result take the screen.
- Before anything is loaded, the joint choice stays above the source buttons as before.

## 0.10.3 - 2026-10-03

### Pickers recover after Android recreates the screen

- Photo, video and camera pickers no longer stay broken after Android destroys and recreates the
  app screen while the app keeps running (for example after it was in the background): the picker
  now registers itself again when opened, instead of failing with "unregistered
  ActivityResultLauncher". The previous restart message stays as a fallback.

## 0.10.2 - 2026-10-03

### Pickers that keep working

- The app now handles every system configuration change itself (font size, display size, language,
  fold), so Android no longer recreates the screen behind the photo and video pickers.
- If a picker still cannot open ("unregistered ActivityResultLauncher"), pose analysis, progress
  photos and form checks say so and ask to close and reopen the app, instead of showing the raw
  native error.

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
