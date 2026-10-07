# Ubiquitous language

Version 1 · 2026-10-07. Bump the version and add a line to "History" whenever a term changes. UI
strings, code, tests and conversations use these words with these meanings.

| Term (en) | Termine (it) | Meaning | Code today |
| --- | --- | --- | --- |
| Program | Programma | A named plan made of prescribed workouts that rotate in order. | `UserProgram` |
| Prescribed workout | Allenamento prescritto | One workout of a program, as planned: name, notes, exercises with their prescriptions. Lives in the program and is never changed by training. | `UserProgramSession` (a "day" in the UI) |
| Prescription | Prescrizione | What is planned for one exercise in a prescribed workout: sets, target, rest, load, RPE, note. | `UserProgramExercise` |
| Workout | Allenamento | What is actually done: started at a time, in progress or finished. Made by starting a prescribed workout, or empty. | `workout` row, `ActiveWorkout` |
| Workout in progress | Allenamento in corso | A workout not yet finished; at most one exists. | `endedAt` is null |
| Exercise entry / set | Esercizio / serie eseguita | What was done inside a workout. | `exercise_entry`, `training_set` |
| Notes | Note | Free text. Prescribed-workout notes are planned; workout notes are about this performance. | `UserProgramSession.notes`, `workout.notes` |

## Rules

- Starting a prescribed workout **copies** its name and notes into a new workout. After that the two are
  independent: editing the workout in progress never changes the program, and editing the program
  never changes workouts already started.
- Editing a prescribed workout is done from the program (long press on its name, or the builder).
  Editing the workout in progress is done by long pressing its name on the workout screen.
- The next workout in the rotation is found by the workout's name (`programSessionWorkoutName`), so
  renaming a workout in progress takes it out of the rotation.

## History

- 1 · 2026-10-07: prescribed workout vs workout split; notes on both.
