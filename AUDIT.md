# Audit (0.18.0, 2026-10-06)

What can be improved, by impact. Items marked **fixed** shipped in 0.18.0; the rest are proposals.

## High

| # | Area | Problem | Proposed fix | Effort | Status |
|---|---|---|---|---|---|
| 1 | Log | Only the latest 365 workouts were listed or shown on the calendar. | Database paging with a cursor; calendar dots per visible range (`listWorkoutsPage`, `listWorkoutStarts`). | M | **fixed** |
| 2 | Workout | Holding a stepper lost steps: each repeat added to a value that only refreshed after a save and a reload. | Steps build on the value shown, save in order, reload once the steps stop (live and finished workouts). | M | **fixed** |
| 3 | Data | "Repeat workout" copied last time's RPE and form ratings, so sets looked rated and exercises folded early. | Copies start without RPE and form. | S | **fixed** |
| 4 | Performance | Every set tap re-reads all finished sets for records: `cachedUntilWrite` (`src/db/cache.ts`) is keyed on `total_changes()`, which any write moves. | Give finished-workout reads their own version, bumped only by writes to finished workouts. | M | proposal |
| 5 | Storage | Removing a set with clips keeps the video files for undo, and nothing deletes them if the toast expires (`removeSetWithUndo`). | Delete the files when the undo toast hides; add a startup sweep of orphaned files. | M | proposal |
| 6 | Data | A failed start of a template program leaves a half-built workout open (`app/program/[id].tsx`). | Reuse `startUserProgramSession` (it cleans up on failure). | M | proposal |
| 7 | i18n | Finishing with half an L/R pair showed Italian text in English; one-sided rest options were Italian only. | Typed `IncompletePairError` worded in the UI; new `logger.*` keys. | S | **fixed** |
| 8 | Data | Progress photos from the gallery were dated "now". | Pickers ask for EXIF so the shot date is kept. | S | **fixed** |
| 9 | Robustness | A failed save at the end of a mobility session locked "Finish" silently. | Marked finished only after the save; error shown, retry possible. | S | **fixed** |
| 10 | A11y | Readiness ratings, fold-all and pose toggles were under 48 dp; stepper labels were only "−"/"+". | 48 dp targets; labels name the field and set. | S | **fixed** |
| 11 | A11y | The rest countdown is a live region that changes every second, so TalkBack reads it every second. | Announce only milestones (10 s, 0). | S | proposal |

## Nice to have

| # | Area | Problem | Proposed fix | Effort | Status |
|---|---|---|---|---|---|
| 12 | Lists | The library, the picker, pose analyses, photos, stats drill-down and training stats rendered every item. | Shared `usePaged` / `usePagedSections` / `<Paged>` with "Show more". | S | **fixed** |
| 13 | Names | Default names mixed languages ("Workout" and "Allenamento"). | `displayWorkoutName` shows the default in the current language. | S | **fixed** |
| 14 | Code | Two near-identical set sheets (live and finished workout). | One `SetSheet` with optional live actions (hold mode, copy last time). | M | proposal |
| 15 | Data | Programs are one JSON row in `settings` (`userPrograms.ts`): every save rewrites all programs. | Tables for programs, sessions and prescriptions. | L | proposal |
| 16 | Log | 1–2 minute workouts with one set clutter the Log. | Offer to discard on finish when almost nothing was logged. | S | proposal |
| 17 | Performance | Starting a program session runs hundreds of queries outside a transaction (`startUserSession.ts`). | Build the rows in memory and insert in one transaction. | M | proposal |
| 18 | Performance | `getPreviousPerformance` loads every historical set of the session's exercises. | Pick the latest workout per exercise in SQL first. | S | proposal |
| 19 | Performance | The whole workout screen re-renders every second during rest. | Keep the countdown inside `TimerBar`. | S | proposal |
| 20 | Storage | Progress photos are stored at full camera resolution (backups embed them). | Resize to about 1600 px on save. | S | proposal |
| 21 | Robustness | `repeatWorkout` is not one transaction; Today swallows its errors and allows double taps. | Transaction, error toast, busy guard. | S | proposal |
| 22 | States | Some screens spin forever or go blank when a load fails (workout, exercise, programs, pose, summary). | The shared error-with-retry pattern. | M | proposal |
| 23 | i18n | Goals, training stats, progress and measurements keep their own copy dictionaries ("1 days"); a few `language === 'it'` ternaries remain. | Move them into `resources.ts` with plurals. | M | proposal |
| 24 | Design | Some colours are hard-coded outside `palette.ts` (overlays, media backdrops). | Hero-overlay and media-backdrop tokens. | S | proposal |
| 25 | Code | Dead exports (`getRecentWeekSummary`, `recordKindLabel`, `weekdayKey`, `archiveCustomExercise`). | Removed. | S | **fixed** |
| 26 | Code | Lint warnings. | Zero warnings. | S | **fixed** |
| 27 | Code | Very large files: `app/workout/[id].tsx`, `session/repository.ts`, `ui.tsx`. | Move the timer bar, readiness and EMOM helpers out; split the repository by workout / set / history. | L | proposal |
