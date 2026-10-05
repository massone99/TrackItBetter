# TrackItBetter: ruthless UX review (v0.11.0)

The review has two passes over a fresh install on Expo web at 412×915, in light and dark:
1. A designer who has shipped Linear-grade products.
2. A first-time user: a calisthenics trainer, phone in a chalky hand.

There is no paywall, so "conversion" here means three things:
- **Activation:** the first set is logged within 60 seconds.
- **Retention:** the person comes back to log again within 7 days.
- **Trust:** the numbers feel right.

Screenshots are referenced as `ux/NN-name.png`. They were taken in this session and are not committed. Every item names its file, so Claude Code can implement it directly. Follow `CLAUDE.md`: tokens, `FooterAction`, i18n in en and it, 48 dp targets, and every screen state.

## Verdict

1. **The core loop fights you.** The second set of an exercise costs 3 taps instead of 1, because completing the last set folds the card and hides "Add set" (C1).
2. **The app lies on the first day.** One set turns the progress bar green, at 100% (C2). The summary then says "No new records" on the very first workout (C3).
3. **Templates, the best asset for beginners, are a dead end.** You can't adopt one, so Today never suggests it (C4).
4. **Rest hides Finish.** For 90 seconds after every set the footer is buried under the timer (C5).
5. **Everything else reads as an engineer's app.** The library leads with its taxonomy, Progress with ratio tables, and the exercise page with admin rows. The real value (your trend, your records) is always one scroll too far.

Fix C1 to C5 before anything else. They are the difference between an app people try once and one they use.

---

## 🔴 Critical

### C1. Completing a set folds the exercise, so set 2 costs 3 taps
*Found by: New user.* Evidence: `ux/08-set-done.png`, `ux/09-second-set.png`. After the check, the Pull-up card collapses to "1/1 sets · 8" and **Add set disappears**. My "Add set" tap did nothing.
- Cause: `src/domain/folding.ts:15-18` folds an entry as soon as all its sets are complete, and `app/workout/[id].tsx` (`refresh`, about line 181) applies it on every refresh.
- Why it kills activation: calisthenics is 3 to 5 sets of the same movement. Every extra set becomes expand → Add set → complete. That is the opposite of "a set in a couple of taps".
- Fix:
  - Never auto-fold on completion in a workout that is not from a program.
  - In a program workout, fold only when the planned set count is reached, and then scroll to the next exercise.
  - A completed last set leaves the card open with **Add set** as the most prominent control.
- Acceptance: after completing set 1, set 2 is logged with 2 taps (Add set, then ✓) and no expand. A test in `src/domain/__tests__` covers the new folding rule.

### C2. One set turns the session "complete": a green 100% bar and "1/1 exercises"
*Found by: Designer.* Evidence: `ux/06-exercise-added.png` shows "0/1 sets · 0/1 exercises". `ux/08-set-done.png` shows a full green bar after a single set.
- Cause: an exercise added by hand starts with **1 set at 8 reps** (`src/features/session/repository.ts:350`, `addSet(entryId)`). The header progress bar measures sets done against sets created.
- Why it hurts: the bar says "done" after one set of an unplanned workout. 8 reps of pull-ups is also an arbitrary default for a beginner, so the very first number the app shows is wrong.
- Fix:
  - A new exercise starts with last time's set count and values (`getPreviousPerformance` already loads them). Otherwise use 3 sets, with the first value taken from the exercise's level and metric.
  - Show the progress bar only for program workouts, where the target is real.
  - In free workouts, show "N sets · M exercises" without a bar or fraction.
  - Drop the duplicated "0/1 sets / 0/1 exercises" pair.
- Acceptance: a free workout never shows a fraction or bar. Adding Pull-up a second time pre-fills the previous session's sets.

### C3. The first workout ends with "No new records this time", and no next step
*Found by: New user.* Evidence: `ux/11-summary.png`, and `app/workout/summary/[id].tsx:134` with `summary.noRecords`.
- Why it kills retention: the very first session **is** a set of personal bests, because it is the baseline. Telling a new user they achieved nothing, at the emotional peak of the product, is the most expensive line of copy in the app.
- The summary also offers nothing that brings them back: no goal, no reminder, no "next session".
- Fix:
  - When this is the user's first finished workout, or the first time for an exercise, show "First session logged: these are your baselines" and list each exercise's best set.
  - Below it, add **one** retention card with two inline controls:
    - "Sessions per week" chips 2 / 3 / 4 / 5, writing the goal used by `getGoalSnapshot`.
    - A "Remind me" switch that opens `/reminders` pre-filled.
  - Show this card only once, after the first workout.
- Acceptance: a fresh install never sees "No new records" on workout #1. The weekly goal can be set without leaving the summary.

### C4. Ready-made routines are a dead end
*Found by: New user.* Evidence: `ux/13-programs-empty.png`, `ux/19-template.png`, `app/program/[id].tsx`.
- I picked "Beginner full body" and could only "Start session" on a fixed Monday, Wednesday or Friday card. Nothing adds it to *my* programs, so Today's "Up next" (`programsByRecentUse`) never knows I'm following it.
- The fixed weekdays contradict the app's own rotation model ("do the workouts in order, on the days that suit you").
- "Workout A" is listed twice, so a 3-day plan shows three nearly identical cards with three Start buttons.
- The routine list puts a 🗑 next to every template. To a newcomer that means "delete", although it only hides the routine (`app/(tabs)/programs.tsx:60-64`).
- Every string on this screen is a hardcoded `language === "it" ? … : …` ternary (`app/program/[id].tsx:24-95`).
- Fix:
  - Make **"Use this routine"** the footer action (`FooterAction`). It converts the template to a `UserProgram` (unique sessions A and B, rotation order A, B, A) with `saveUserProgram`, then goes to Today with the hero on its first workout.
  - Show each unique session once and drop the weekday labels.
  - Show templates *above* "Create a program" when the user has no program, because picking is cheaper than building.
  - Move "Hide" into a long-press or overflow menu.
  - Move every string to `resources.ts` (en and it).
- Acceptance: one tap from the template makes Today's hero say "Up next · Beginner full body / Full body A". No `language ===` ternaries remain in `app/program/[id].tsx`.

### C5. The rest timer buries Finish and Add exercise for the whole rest
*Found by: New user.* Evidence: `ux/08-set-done.png`. Tapping "Finish workout" during rest timed out, because the `TimerBar` (`app/workout/[id].tsx`, `styles.timerBar`, absolute `bottom: 0`) covers the `Screen` footer.
- Why it hurts: you finish a workout right after the last set, which is exactly when the timer is running. The user has to find and tap "Skip" first.
- Fix:
  - Stack the timer above the footer instead of over it. Render `TimerBar` inside the `Screen` footer slot, above the two `FooterAction`s, or give `Screen` a `footerAccessory` prop.
  - Keep the timer compact (one row: time, −15, +15, Skip).
- Acceptance: during rest, Finish is one tap away. At default font size the timer plus footer take at most about 150 dp.

---

## 🟠 High impact

### H1. The workout screen has 15+ controls before the first set
*Found by: Designer.* Evidence: `ux/06-exercise-added.png`. To log one set I see:
- the mute toggle (unlabelled; `app/workout/[id].tsx:555`)
- "How are you feeling?"
- "Collapse all" with one exercise
- a drag grip with one exercise
- a chevron
- **two** "⋯" menus 40 px apart
- "First time logging this movement"
- a Set / Reps header
- a stepper and a ✓
- Add set and Add warm-up
- "Save as program workout"
- Discard
- the footer

Specific problems:
- The swipe hint never goes away for people who tap ✓, because only a swipe dismisses it (`markSwiped`, `app/workout/[id].tsx:453`).
- Fix:
  - Hide the grip and "Collapse all" when there is a single exercise.
  - Merge the per-set "⋯" into the long-press menu that already exists (CLAUDE.md: a held press opens the set menu).
  - Show the readiness check-in once per workout as a dismissible chip, collapsed after the first set.
  - Dismiss the swipe hint after 3 completed sets by any method.
  - Move "Save as program workout" to the summary.
  - Give the voice toggle a visible text label or move it into the timer bar.
- Acceptance: with one exercise and no sets done, the card shows name, set row and Add set, and nothing else at the same weight.

### H2. The exercise picker leads with taxonomy, not with my exercises
*Found by: New user.* Evidence: `ux/04-picker.png`.
- Before a single exercise is visible I get:
  - category chips
  - "Create a new exercise"
  - **"Group by"** with three toggles and an explanatory paragraph
  - "106 movements"
  - a header **"Push · Horizontal push / No movement tag · 7"**
- "No movement tag" is internal jargon.
- Every row has the same ↑ icon.
- "Push-up" and "Standard Push-up" both exist, and I can't tell which is "mine".
- The keyboard doesn't open, so search needs an extra tap.
- Fix (`src/features/exercises/ExercisePicker.tsx`, `LibraryView.tsx`):
  - Search field on top with autofocus in the picker.
  - Then **Recent** and **Favourites** rows.
  - Then a flat A–Z list.
  - Move grouping into a filter sheet behind an icon, defaulted off in the picker.
  - Hide empty-tag headers.
  - Give each row the category icon (the library already has `iconForCategory`).
  - Merge or rename the duplicate push-up entries in `src/db/seed/exercises.json` with a migration that keeps user data.
- Acceptance: the first exercise row is visible above the fold, and a used exercise is reachable in 1 tap from the picker.

### H3. Progress shows no progress above the fold
*Found by: Designer.* Evidence: `ux/16-progress-empty.png`, `ux/21-progress-data.png`, `ux/22-progress-data-2.png`.
- The first screen is two counters, two navigation rows, and a "Weekly movement balance" table ("Horizontal push : pull 4 : 0").
- The charts (the reason to open this tab) start after a full scroll, and are sorted alphabetically: "Chest-to-wall Handstand Shrug" comes first.
- "Training volume" repeats the counters.
- On an empty install it shows **five** cards of zeros.
- Fix (`app/(tabs)/progress.tsx`):
  - Hero is the trend of the most-trained exercise in the last 30 days, or the latest PR.
  - Then trends sorted by recent activity.
  - Then the records list.
  - Move movement balance into `/stats`.
  - Remove the "Training volume" card.
  - Empty state: one `EmptyState` with "Log a workout to see your progress" and a Start button.
- Acceptance: with seeded data, a chart is visible without scrolling. An empty install shows exactly one card.

### H4. The Log tab is a calendar with a list hiding under it
*Found by: New user.* Evidence: `ux/23-log-data.png` and `app/(tabs)/log.tsx`.
- The month grid uses the whole first screen.
- Trained days are 4 px dots.
- Today isn't marked.
- The sessions (what I came for: "what did I do last Push day?") start below the fold.
- Fix:
  - Default to a one-week strip with trained days filled (reuse the Today dots), expandable to the month.
  - List sessions right under it.
  - Mark today.
- Acceptance: at least two sessions are visible above the fold with seeded data.

### H5. The exercise page leads with admin, not achievement
*Found by: Designer.* Evidence: `ux/24-exercise-detail.png` and `app/exercise/[id].tsx`.
- First come "Movement classification" and "Add a form reference video", then cues and tags. My records, the thing I'm proud of, are below the fold.
- Fix:
  - Order: records → trend → history → cues.
  - Classification and the reference video go at the bottom under "Manage", next to transfer and delete.
- Acceptance: the best set is visible without scrolling.

### H6. Goals and reminders, the main retention levers, are never offered
*Found by: New user.*
- The weekly target silently defaults to 3, and Today shows "0 of 3 sessions" on day one.
- Reminders sit under You → Training → Workout reminders, two levels deep.
- Nothing ever asks me.
- Fix: see C3 (the inline goal and reminder on the first summary). Also, when the goal comes from the default, Today's week card says "Set your weekly goal" with the chips inline.
- Acceptance: a user who never opens You can still set a goal and a reminder.

### H7. Monday morning says "0 of 3"
*Found by: New user.* Evidence: `ux/26-today-dark.png`.
- The week resets at Monday 00:00, so the home screen starts every week empty, no matter how good last week was. The streak pill is only shown when it is above 0.
- Fix (`app/(tabs)/today.tsx`):
  - On Monday and Tuesday with 0 sessions, show "Last week: 3 of 3 ✓" under the dots.
  - Keep the streak pill as "Best: N" when the current streak is 0.
- Acceptance: on a Monday with last week complete, the card shows a positive line.

### H8. The same action, shown twice on the same screen
*Found by: Designer.*
- Programs has a "+" icon button **and** a "Create a program" button in its empty state (`ux/13-programs-empty.png`).
- The template detail repeats Start for every day (C4).
- The summary shows "Workout" both as the title context and as the name (`ux/11-summary.png`), because new workouts are called "Workout" (`src/features/session/repository.ts:159`).
- Fix:
  - Hide the header "+" while the empty state's button is visible.
  - Name free workouts after the first exercise or the time of day ("Pull-up session", "Morning session"). The rename stays available.

---

## 🟢 Nice to have

- **N1. Filler copy that reads as AI-generated.**
  - "Your space · Make training feel like yours." (You)
  - "Small wins add up." (Progress)
  - "Pick up where you left off." on an empty log
  - "A calm, local-first home for your calisthenics journey."

  Replace each with a concrete line or remove it. Also align names: the tab "You" is titled "Your space", and the tab "Log" is titled "Training log".
- **N2. i18n outside the shared resources.**
  - `app/(tabs)/progress.tsx:20+` (local `copy` table)
  - `app/program/[id].tsx`
  - `app/form-check/[setId].tsx`

  Move all of it into `src/shared/i18n/resources.ts`.
- **N3. Bare values.** A folded exercise shows "8" (`ux/08-set-done.png`). Show "8 reps" or "8 · 9 · 10 reps".
- **N4. Plurals on the summary.** "1 Minutes" (`ux/11-summary.png`) needs `_one` and `_other` keys.
- **N5. "Quick log" is a misnomer.** Mobility session and Pose check are tools, not logs. Rename the section to "Shortcuts".
- **N6. Today link icon.** "Start an empty workout +" puts the icon after the text, unlike every other link. Put it first.
- **N7. Profile preferences** form a long wall of segmented controls; the rest defaults show the value twice ("90 s" plus chips). Move them to a "Settings" screen with one row per preference.
- **N8. Template detail** uses an "Overview" card with shadow and muted background, which no other screen uses. Use `Body` text, as the user program page does.
- **N9. Unverified here:**
  - layout at 200% font scale (the web build can't emulate Android font scale)
  - native swipe and drag feel
  - background timers

  The owner should check C1, C5 and H1 on a phone at the largest font size.

---

## Do not do

- No onboarding carousel or account wall. Today's "start in one tap" is the app's best feature; keep it.
- No badges, confetti or streak-loss guilt notifications. Celebrate only real PRs and baselines (C3).
- Don't add more cards to Today. Every fix above moves things *off* screens or *down* the hierarchy.
- Don't change portrait-only or the Today layout from 0.11.0. Both are owner decisions; H7 only adds a line inside the existing week card.
