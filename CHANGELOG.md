# Changelog

Release notes for TrackItBetter, newest first.

## 0.45.6 - 2026-10-19

- Workout: turning focus mode off with a set open no longer makes that set vanish and leave a blank gap.

## 0.45.5 - 2026-10-19

- Workout: a set's chips and its RPE, form and ROM scales line up under the values with even margins; the scales show every value on two rows instead of a strip cut at the edge.

## 0.45.4 - 2026-10-19

- Focus mode: the set card uses one even spacing between header, fields, chips, scale and button; folded sets sit closer together; chips and scales of a done set line up with its text.

## 0.45.3 - 2026-10-19

- Focus mode: the set's value chips and scales sit inside the set card, above "Complete set"; collapsed sets no longer open RPE scales; a done set opens the form scale instead of the RPE one, so the next set stays in place.

## 0.45.2 - 2026-10-19

- Workout toolbar: check-in and "Collapse all" share the first row; Focus, Voice and narration chips sit side by side on their own row, left-aligned, instead of stacking in the middle.

## 0.45.1 - 2026-10-19

- Set values work like tabs: the chips RPE · Form · ROM · Bands · Note pick what to edit, and only the chosen scale shows below them, in its own panel. By default the first value still to fill opens (RPE, then form once the set is done, then ROM).

## 0.45.0 - 2026-10-19

- Workout: every value of a set is one tap away. Under the set in hand, the done sets and (in a finished workout) every set, a strip of chips shows RPE, Form, ROM, Bands and Note: filled with the value, or dashed when empty. RPE, Form and ROM open their picker right there (tap again to close); Bands and Note open the set's sheet straight on the bands or on the note. Record, clip and pose chips stay.

## 0.44.0 - 2026-10-19

- Workout: once a set is rated and a later set is done, its RPE, form and ROM pickers fold into value chips (RPE 8 · Form 4 · ROM 4,5, with bands, record, clip and note chips); tap a chip to reopen its picker. The set just done keeps its pickers open. In a finished workout every set shows its values as chips. The chips are now 32 dp tall with a larger touch area and wrap onto more lines.
- New Focus chip on the workout screen: the set in hand opens as a large one-column block (big fields, one set at a time), the others fold to one line. The choice is remembered.
- Nothing was removed: every field, action and menu of a set is still there.

## 0.43.0 - 2026-10-19

- When a workout started from a program ends with a different structure (exercises added or removed, other order or number of sets), the app offers to update the prescribed workout in the program too.
- From a past workout that belongs to a prescribed workout, a new "Update prescribed workout" button takes what was done (exercises, order, sets, targets, loads, rest) back into the program.

## 0.42.0 - 2026-10-19

- Goal history: a calendar icon on the goals screens opens a month calendar of the days where all goals were reached (green with a check) or some (2/3), with the goals of the day you tap; the Weekly tab lists the weeks with an expandable detail. Current and best streak of days or weeks.

## 0.41.3 - 2026-10-18

- Narrated workout: finishing no longer checks that both sides of an L/R set were done in the narration, so narrating only the side left to do (the other already done in the workout) saves it and returns to the workout.

## 0.41.2 - 2026-10-18

- Toasts (such as "Set removed") can be swiped away sideways.

## 0.41.1 - 2026-10-18

- Exercise options: "Compare with" is now a choice between "Last time in this workout" and "Last time of this exercise", instead of a list of past workouts.

## 0.41.0 - 2026-10-18

- Weekly goals can be derived from the daily ones: "From the daily goals" on the weekly goals page turns each daily goal into a weekly one (daily total times the days per week you choose, up to 7). It shows what will be added first, leaves weekly goals that already count the same thing as they are, and every goal can be edited afterwards.

## 0.40.1 - 2026-10-17

- Goals: a one-sided exercise counts once, not once per side: 10 reps (or 30 s) on each side count 10 (30), unequal sides count their mean. Same as the statistics. Daily and weekly goals.
- Programs can be imported from a JSON file also from the Programs tab ("Import programs from JSON"); the format now takes a RPE per set. Example in docs/import-examples/example-program.json.

## 0.40.0 - 2026-10-17

- Weekly goals: the same goals as the daily ones (category, movement group or tag, in minutes or reps, tap a goal to open it in place, details, mini session), counted over the week from Monday to Sunday. Two separate pages, Daily and Weekly, with a switch at the top of each, under one "Goals" area on the Today screen that shows a card for each.

## 0.39.0 - 2026-10-17

- Import from JSON: a file can bring in custom movements, mobility routines and programs (not only mobility). You see what it holds before anything is added; movements already in the app are reused. Open it from Mobility → Create → "From a JSON file" or Data → "Import from JSON". Format and an example (Tom Merrick, 15 Minute Full Body Mobility) in docs/IMPORT_JSON.md.

## 0.38.2 - 2026-10-16

- ROM counts for mini PRs like form: a higher average ROM than last time is a mini PR ("better ROM" in the workout summary, green ↑ on the folded exercise), and a lower one blocks the "same work at a lower RPE" mini PR.

## 0.38.1 - 2026-10-16

- Workout: the ROM chips (1 to 5) sit right under each working set, like the RPE row, so you rate it without opening the set sheet (also in the finished workout's editor).

## 0.38.0 - 2026-10-16

- "Vs last time" now compares an exercise with its latest time in the same session (a workout with the same name, e.g. the same program day), set 3 with set 3; with none, it falls back to the latest time anywhere.
- Per exercise, pick another past workout to compare with from the exercise options ("Compare with"), or go back to Automatic.
- Profile: choose the default comparison, Same session or Any workout.
- Backups now keep an exercise's total goal and chosen comparison (the total goal was missing from the restore format).

## 0.37.1 - 2026-10-16

- ROM now counts everywhere form does: "vs last time" (average ROM, red ↓ when lower), the workout recap, the exercise history and the entry page, and Statistics (new metric: Average ROM).

## 0.37.0 - 2026-10-16

- ROM: every working set can be rated for range of motion with the same 1 to 5 chips as form (set sheet, under Form).
- Average RPE, form and ROM of an exercise can now be set during the workout too, from the exercise's options (they go to its done working sets).

## 0.36.4 - 2026-10-16

- Workout: a "Copy last time to all sets" button under each exercise fills every open set from the matching set of last time (warm-ups with warm-ups, working sets with working sets) in one tap.

## 0.36.3 - 2026-10-16

- A new exercise in a workout starts from last time: same warm-ups and working sets, loads, rest and bands (RPE and notes start empty).
- Starting a program day also brings last time's warm-ups and bands.

## 0.36.2 - 2026-10-16

- Copy last time: warm-up sets now match last time's warm-ups, and working sets match working sets, by position.

## 0.36.1 - 2026-10-15

- Micro-session: the exercise picker stays open and lets you tick several exercises at once (tap again to untick), then Done adds them all.

## 0.36.0 - 2026-10-15

- Today's goals, more compact: a segment bar with one segment per goal replaces the big header, and every goal is one row (name, what it counts, today's amount, what is left or how far past it).
- Tap a goal to open it in place: change its daily total with − and +, open its details, edit, duplicate, move it up or down, or delete it (with Undo). Goals stay the same every day until you change them.
- The Today card is one compact block (reached count, segment bar, what is still missing); the goal details show the total next to the title.

## 0.35.0 - 2026-10-15

- Today's goals: set totals to reach today by main category (push, pull…), movement group (vertical pull…) or movement tag (hip flexion…), in minutes (timed sets) or reps. Every working set done today counts, mini sessions included.
- A card on Today shows how many goals are reached and the open ones; the goals screen lists what is left and what is reached, and each goal shows where today's total came from and the exercises that count, ready to start a mini session.

## 0.34.1 - 2026-10-15

- Rest: the +15 s / −15 s buttons now change the rest saved on the set, so the recorded rest (and the comparison with last time) is the one you actually took.

## 0.34.0 - 2026-10-15

- Exercise page: a History row near the top (number of sessions and the last date) opens every session of that exercise, newest first, grouped by month.
- Each history row shows the sets, average RPE and form, and how the total compares with the previous session (↑ / = / ↓). Tapping it opens that exercise in that workout, where ◀ ▶ step to the older or newer session (3 of 24), with Whole workout and Edit one tap away.

## 0.33.5 - 2026-10-14

- Workout: the RPE and form rows are one line each that scrolls sideways to reveal every value (half points included); they open on the chosen value, or on 7–8 and 3,5. With very large text they still wrap.

## 0.33.4 - 2026-10-14

- Workout: RPE half points (6,5 · 7,5 · …) are back on the set row itself; all nine values show, wrapping onto a second line.

## 0.33.3 - 2026-10-14

- Reps and kg fields always open the numeric keypad (never the full keyboard with symbols). A negative load (band assistance) is set with the − button.

## 0.33.2 - 2026-10-14

- Form ratings go from 1 to 5 in half steps (1,5 · 2,5 · …), in the workout, the exercise averages and backups.

## 0.33.1 - 2026-10-14

- Very large text: completing a set always moves on to the next one, the set in hand can no longer be swiped by accident, and set rows no longer fade in (rows could stay invisible on some phones). The set menu is no longer nested inside the row button.

## 0.33.0 - 2026-10-14

- Total goal per exercise: reach a total of reps, time or metres in as many sets as it takes. Set it in a program (Fixed sets | Total goal in the exercise sheet, with an optional per-set start) or during a workout from the exercise menu.
- In the workout the card shows "32 / 50 reps · 18 to go", turning green when reached (with any extra). Each completed set adds the next one, filled with the last value but never more than what is left.
- Self-regulated rest: after a set under a total goal a clock counts the rest up, with the usual rest timer one tap away.
- The exercise detail in the recap shows whether the goal was reached.

## 0.32.0 - 2026-10-14

- Program builder: each exercise is now one compact row (grip, name, chips for sets, load, rest, RPE) and opens in a sheet to edit sets, target, rest, RPE, load and note, with move up/down, replace and remove. Dragging no longer fights an open editor.

## 0.31.2 - 2026-10-14

- Program builder: the dragged exercise is opaque with an edge (no more overlapping text), its editor folds while you drag, quick values (hold, rest) sit in an even grid, and the rest value no longer wraps onto two lines.

## 0.31.1 - 2026-10-13

- Equipment: renaming a band set and going straight back (keyboard still open) now keeps the new name; it is saved on the way out.

## 0.31.0 - 2026-10-13

- Workout recap: opening a workout from the Log (or Stats, or an exercise's history) shows its recap first: duration, sets, exercises, reps, kg lifted, average RPE and form, the records, what beat last time and every exercise with its trend. Edit opens the editable workout as before; Repeat starts it again; Share is at the top. The screen after finishing uses the same recap.
- Exercise in a workout: tap an exercise in the recap for all its numbers in that workout: totals and averages, every set (RPE, form, rest, notes, record sets highlighted), a today-vs-last-time table and the records it set.

## 0.30.6 - 2026-10-13

- Workout: Discard workout, Save as program workout, How are you feeling? and the Voice chip are visible again (no hidden menu).
- RPE is back before you complete a set (the set in hand and the done ones), as five whole values in one row aligned with Form; halves stay in the set menu. An exercise still folds only after its form is rated.
- No more flicker or vanishing sets: set rows and exercise cards no longer run layout and exit animations.

## 0.30.5 - 2026-10-12

- Tidier workout screen: the title stays on one line with the stopwatch beside it; voice and a ⋮ menu (How are you feeling?, Save as program workout, Discard) sit in one quiet row; the bottom bar is a compact + and a wide Finish.
- Set rows lose the column headers (the first row labels its value), a set with no load shows a single "+ kg" until tapped, and RPE (whole values; halves in the set menu) appears once the set is done.

## 0.30.4 - 2026-10-12

- Very large text: the workout shows one set at a time as a clean one-column card (labelled fields with big − and +, RPE in rows, one wide Complete / Start hold button); the other sets fold to a single line you tap to open. Add set and Add warm-up become full-width buttons.

## 0.30.3 - 2026-10-12

- With very large text, each set in a workout stacks vertically: reps on one line, kg on the next (both labelled), done and menu below.

## 0.30.2 - 2026-10-12

- Very large text: the bottom bar of a screen (e.g. Add exercise and Finish workout with the rest timer) no longer pushes its buttons off the screen. The buttons stay side by side and wrap their labels, come before the rest timer, and the bar never takes more than half the screen (it scrolls inside if needed).

## 0.30.1 - 2026-10-12

- Number fields accept numbers only, whatever the keyboard or a paste offers: reps and sets (and other whole-number fields) open the plain number pad without a decimal separator; kg fields (set load, bodyweight, band kg) take digits with one decimal separator, and a minus only where a negative load is allowed.

## 0.30.0 - 2026-10-12

- Starting a program workout prefills each set with what you did the last time you did that same workout: reps, time or distance and load, set by set (and side by side for unilateral exercises). Extra sets the plan now has repeat the last one done. A workout never done before still starts from the plan's targets and loads. The same applies to mobility routines started as a regular workout.

## 0.29.3 - 2026-10-12

- Duration fields (holds, rests, timed sets, the estimator) open the plain number pad and accept digits only. They read like a kitchen timer: up to two digits are seconds (45 is 0:45, 90 is 1:30), longer entries end with the seconds (130 is 1:30, 1000 is 10:00). Editing starts from the current value in the same form.

## 0.29.2 - 2026-10-12

- Bands can be renamed where they are used: a pencil next to each band in the workout's band picker and in the band order opens "Rename band". In a band set the rows show a pencil too (tap opens the band's name, colour and kg). The band keeps its id, so sets already logged with it show the new name.

## 0.29.1 - 2026-10-12

- Rest countdown notification: the time left is now shown large in the body of the notification and ticks every second with the app in the background or closed (the system draws it). Before, only the small header clock counted down, which some phones hide.

## 0.29.0 - 2026-10-12

- Text follows the phone's font size up to 200% (was 140%). You → Appearance → "System text size" can keep the old limit (up to 140%). Body text grows fully; headings grow less and large numbers (timers, titles) least, so they stay on screen.
- Layouts adapt from 150% text: footer actions stack, a heading's action moves under the title, stepper labels go above their controls, segmented choices wrap two per row, menu tiles go two per row. Tab labels grow up to 130% so the bar keeps five tabs. The RPE and "last time" chips widen with their text.

## 0.28.4 - 2026-10-12

- Rest timer outside the app: the end-of-rest alert now rings on the alarm channel, so it is heard with the app closed and the phone on silent, and it is scheduled before (and independently of) the live countdown, so a failing countdown can no longer cost the sound.
- The live rest countdown in the notification shade uses its own white stopwatch icon and a default-importance silent channel, so it is listed with the active notifications and shown on the lock screen instead of being folded away.

## 0.28.3 - 2026-10-12

- Narrated mode always starts with the voice on (routines and workouts); the speaker button in the player turns it off for that session only. The voice switch in You is gone.
- Narrated workout: finishing now marks the sets done, each with the time it was done (before, no set was saved). A unilateral pair with one side already done narrates only the other side.
- Narrated player: a pending repeat of an announcement is dropped after Skip, Back or leaving, and is not repeated while speech is under way; an interrupted session resumes only if the plan is unchanged.
- "Regular workout" from a routine uses the routine's saved name and fills the target in the exercise's own measure (left open when they disagree).
- Home "Choose a workout" offers to resume the open workout instead of starting a second one. Deleting a routine while it is saving no longer brings it back.

## 0.28.2 - 2026-10-12

- Mobility: the play button of a routine (in the list, the suggested card and the builder) now always starts the narrated player with the voice on; the silent start is gone (the voice can still be turned off inside the player). The second button opens the routine as a regular workout.
- Narrated player: when the phone's text-to-speech reports an error, the player says so on screen instead of staying silent.

## 0.28.1 - 2026-10-12

- Narrated player: an announcement that does not start within 1.5 s is spoken once more, so the voice is not lost when the speech engine drops the first request (in 0.27.0 only the beeps of the last three seconds were audible).

## 0.28.0 - 2026-10-12

- A mobility routine can now be done as a regular workout too: its menu has "Start as a regular workout", which opens the usual workout screen with the sets prefilled (rounds as sets, hold seconds or reps as target, rests carried over), next to the guided player and the narrated mode. It asks to resume first if a workout is already open.

## 0.27.1 - 2026-10-12

- Narrated player: the announcement of the exercise before the preparation countdown is no longer lost. The player now waits for the previous speech to be stopped before speaking, so a late stop cannot flush the new announcement and start the countdown in silence.

## 0.27.0 - 2026-10-12

- Mobility home: routines are grouped by program, in sections you can collapse (the choice is remembered). A routine made from a program workout is filed under that program; older ones are matched by the name of the workout, otherwise they sit under "No program". The menu has "Move to a program".
- Compact routine rows: Narrated, Start and a menu in 48 dp buttons, with a "Create" button at the bottom right (new routine, from a workout, convert a program). The exercise cycles are folded by default under the routines.
- Routine builder: saves by itself after a pause; a routine without a name takes the name of its first drill instead of being lost; Start and autosave can no longer create it twice; duplicate a drill; star as favourite; 40-drill limit explained; the "added" message fades; save errors show Try again.

## 0.26.0 - 2026-10-12

- Home: "Choose a workout" under the main card opens a list of all programs (yours first, then the built-in ones) and, one tap further, their workouts, so you can start any of them without going through the suggested one or an empty workout. "Empty workout" stays next to it.

## 0.25.0 - 2026-10-12

- Mobility home: a "Suggested today" card at the top proposes the routine never run, or run longest ago (favourites first), with its length and when it was last run, and a play button. The last run is remembered from now on; routines run before this version show as not run yet.
- Weekly mobility goal: tap the week summary to set 30 to 150 minutes (or none); a bar shows the progress, counted on hold time over the last 7 days.

## 0.24.0 - 2026-10-12

- Mobility home redesigned: a Create row (new routine, from a workout, convert a program), All/Favourites filter, and one card per routine with Start (silent) and Narrated buttons plus a menu to edit, duplicate, favourite or delete.
- New "From a program" screen: pick one of your programs or a built-in one and turn a single workout, or every compatible workout, into mobility routines. Each workout is rated Compatible, Partial or Not compatible; only the mobility exercises are copied (sets become rounds, targets become holds or reps, rests carry over). The program does not change.
- Routine builder: drills used in other routines appear as one-tap chips (with the settings last used) and an Undo toast; drill cards fold to a one-line summary; the routine saves itself when you leave, and Start / Narrated sit in the footer.

## 0.23.4 - 2026-10-12

- Narrated player: the spoken countdown numbers (3, 2, 1) no longer cut an announcement that is still being spoken.

## 0.23.3 - 2026-10-12

- Narrated player: the countdown of a set, preparation, switch or rest now starts when its announcement has finished, so the voice no longer eats into the time (at most 8 s of waiting). Without voice it starts at once; pausing during the announcement skips the rest of it.

## 0.23.2 - 2026-10-11

- The stopwatch also runs in the narrated player (workouts and mobility routines), under the top bar.

## 0.23.1 - 2026-10-11

- The workout screen now shows a stopwatch under the title, ticking every second from the start of the workout until you finish it.

## 0.23.0 - 2026-10-11

- Narrated mode for mobility workouts: a mic chip on a workout made only of mobility exercises starts a hands-free session. It announces each exercise and set, counts down a preparation before every set and every change of exercise, runs holds on their own and waits for Done on rep sets, follows supersets round by round and announces the rest, which is separate from the preparation. Sets are marked done when you finish. New Narration section in You: spoken cues on/off and the preparation length (default 5 s). The guided mobility routines share the same player; a rest is no longer stretched into the preparation, which follows it.

## 0.22.0 - 2026-10-09

- Estimate your max: new screen on Home (above the pose analysis), independent of any exercise. From one set (reps or hold, RPE, bodyweight or external load only, added load, bands or manual help) it shows max reps or longest hold, estimated 1RM and the load for 1, 3, 5, 8, 10 and 12 reps. It reuses the exercise page's stat tiles, RPE picker and bands picker.

## 0.21.12 - 2026-10-08

- Estimated max (reps or hold) can be read at any trained net load: chips under the estimate (from the most help to the most load added, "−25 kg", "Body", "+10") choose the condition, so you see the estimate with a given help, without help, or at a given load. It opens on the most recent one, and the chosen chip stays in view.

## 0.21.11 - 2026-10-08

- Reps by load or help: the chips of the 5 most recently trained loads are now in scale order, lowest to highest (like the ‹ › step), instead of most recent first.

## 0.21.10 - 2026-10-08

- Reps by load or help with many trained loads: the selector keeps one height however many loads there are. A step ‹ › moves to the next lower or higher load (to compare close ones), chips jump to the 5 most recently trained loads, and "All (N)" opens the full ladder in a sheet, from the most help to the most load. Before, "Show all" opened a wall of rows and pushed the chart out of sight.

## 0.21.9 - 2026-10-08

- Reps by load or help (exercise page and statistics): every load at a glance as a ladder, the most load first down to the most help. Each row shows the last session, the best and the change since the one before, and one tap charts its sessions (before: a weight picker in a sheet). The selected load stays in view; "Show all" opens the rest.
- The comparison now uses the net load: weight added minus the kg of help from bands, so helped sets no longer mix with plain bodyweight sets (bands of unknown kg are left out).

## 0.21.8 - 2026-10-08

- Estimated max (reps or hold) now works for every exercise but distance, loaded and band-assisted ones included: it compares only sets at the same net load (load added minus help from bands) and says which ("At +10 kg", "With 20 kg of help from bands"). Sets with bands of unknown kg are left out.
- New "Estimated 1RM" on the exercise page for rep exercises: from the effective load (bodyweight share + load added − help from bands) and the reps plus the reps in reserve given by RPE, up to 12 reps. It shows the latest and best estimate and what it means against your body: about +N kg that could be added, or N kg of help still needed for a single rep.
- Effective load, estimated 1RM records and trends now subtract the help from bands.

## 0.21.7 - 2026-10-08

- Statistics by period: the sets done with bands are counted, with the average kg of help over those whose kg are known ("6 sets with bands · average help 18 kg"), per period, group, tag and exercise.
- Set menu → Bands: "Use for all sets of this exercise" gives every set of the exercise in that workout the same bands, in a workout in progress and in a finished one alike.

## 0.21.6 - 2026-10-08

- Band assistance is a record: "Least help from bands for this work" when a set does at least the reps (or seconds) of an earlier set with less help (kg when known, else the strength order, also across band sets; no band at all counts as the least help). It shows as a PR in the workout and in the summary.
- Summary: "better than last time" counts less assistance ("2 kg less help", "lighter bands"), compares with the same apparatus and uses the strength order.
- Exercise history shows the help of each set, e.g. "6 (−15 kg band)".

## 0.21.5 - 2026-10-07

- Micro-session is now an ordinary workout: you choose the N exercises first (recent ones, or "Add exercise"), then "Start" opens the same workout screen with sets, rest timers, notifications, notes, bands and everything else. It is named "Mini-session N" and finishes like any workout. If a workout is already in progress, it says so instead of starting.

## 0.21.4 - 2026-10-07

- More band colours: 18 to pick from (reds, pinks, purples, blues, greens, browns, white, greys, black) and any other colour typed as #rrggbb.

## 0.21.3 - 2026-10-07

- Workout screen, more room for the sets: once an exercise has a done set, "vs last time" folds into one line (tap it for the cells); the swipe hint closes with × and goes away after the first done set.
- Set menu shorter: bands are one row ("Bands: Blue T2") that opens their own view.
- A done set is marked by its tint and green check only; the set number no longer turns solid too.
- Bands on an L/R pair go on both sides.
- Without kg, an "average assistance" cell no longer shows next to the strength-order line.

## 0.21.2 - 2026-10-07

- Finished workout: an exercise's menu sets its average RPE and average form by hand. The value goes to every completed working set (warm-ups and open sets are left alone), so statistics and "vs last time" use it.

## 0.21.1 - 2026-10-07

- Replacing an exercise in the workout no longer carries its note (from the program's prescription) or apparatus over to the new exercise.
- Done sets are tinted consistently: before, some done sets kept no tint after rows moved.
- EMOM bar: round and exercise on top, the time large beside Stop, a bar of rounds done, then the value of this round. The time no longer disappears.
- Strength order of bands (Equipment → Strength order): every band of every band set from the lightest to the strongest. Without kg, "vs last time" compares the help through this order, also across band sets ("lighter / same / stronger bands than last time"); it gives up only when the order cannot tell (e.g. one strong band against two lighter ones). Reordering a band set keeps the global order in step.
- Band chip on a set reads "Blue T2" (tension 2).

## 0.21.0 - 2026-10-07

- Equipment (Profile → Equipment): apparatus (bar, rings, parallel bars, parallettes, floor, wall bars, plus your own) shared by every exercise, and band sets (e.g. "Decathlon") with each band's colour and, when known, kg at minimum and maximum stretch, ordered lightest to strongest.
- Exercise settings: the apparatus it can be done on, the default, and "the apparatus changes the difficulty". When on, "last time", the comparison and records only use sessions on the same apparatus, and a first session there says so. Choose the apparatus per exercise in the workout from its menu.
- Bands per set (set menu): one or more bands, each with tension 1–3; the assistance in kg is saved with the set, shown under it, copied to new sets and "use for the remaining sets". "Vs last time" compares average assistance (less is progress); with a band without kg it says the assistance cannot be compared. Records count band assistance as negative load.
- Old free-text band values move into the set note.
- Running EMOM and long workouts are tidier: done sets drop their − and + (tap the value to edit it), and the EMOM bar no longer squeezes its labels into an empty block.

## 0.20.5 - 2026-10-07

- Completed sets can be edited in the workout in progress (and in a micro-session): the − and + buttons and the typed value stay available after the check. Saved values update at once; the set stays done and the rest timer keeps running.

## 0.20.4 - 2026-10-07

- Rest countdown always in the notification shade and on the lock screen, ticking in real time by the system (the native module was missing from the repository, so the countdown never appeared).
- Rest notifications no longer pile up: a new rest replaces the previous countdown and the previous end alert.

## 0.20.3 - 2026-10-07

- Exercise menu, more ergonomic: it fits one screen without scrolling. Rest after working sets and warm-ups are one line each with − and + (15 s steps, tap the number to type it); part of the workout is a segmented control; the note folds into one row until you open it; actions are tiles in a grid; Remove stays apart at the bottom.

## 0.20.2 - 2026-10-07

- Exercise menu in the workout, reorganised: note and part of the workout first, then rest (and superset) settings in their own blocks, then the actions (superset link, EMOM, replace, edit, reference video) as one compact list, and remove apart at the bottom. Same functions as before.

## 0.20.1 - 2026-10-07

- − and + step the number you are typing (reps, time, distance, load) instead of the saved one, and the field stays open.
- In a superset the screen no longer jumps to the next exercise until the set's form is rated; rating it moves on.

## 0.20.0 - 2026-10-07

- Notes on a prescribed workout (program) and on the workout in progress; starting a workout copies the notes.
- Long press the workout name (in the workout, or a day in a program) to edit its name and notes. Editing the workout in progress never changes the program.
- `docs/LANGUAGE.md`: versioned vocabulary (prescribed workout vs workout).

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
