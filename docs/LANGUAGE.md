# Ubiquitous language

Version 2 · 2026-10-07. Bump the version and add a line to "History" whenever a term changes. UI
strings, code, tests and conversations use these words with these meanings.

| Term (en) | Termine (it) | Meaning | Code today |
| --- | --- | --- | --- |
| Program | Programma | A named plan made of prescribed workouts that rotate in order. | `UserProgram` |
| Prescribed workout | Allenamento prescritto | One workout of a program, as planned: name, notes, exercises with their prescriptions. Lives in the program and is never changed by training. | `UserProgramSession` (a "day" in the UI) |
| Prescription | Prescrizione | What is planned for one exercise in a prescribed workout: sets, target, rest, load, RPE, note. | `UserProgramExercise` |
| Workout | Allenamento | What is actually done: started at a time, in progress or finished. Made by starting a prescribed workout, or empty. | `workout` row, `ActiveWorkout` |
| Workout in progress | Allenamento in corso | A workout not yet finished; at most one exists. | `endedAt` is null |
| Exercise entry / set | Esercizio / serie eseguita | What was done inside a workout. | `exercise_entry`, `training_set` |
| Apparatus | Apparato | Where an exercise is done (bar, rings, parallettes…). One global list; each exercise picks which apparatus it can use and a default. | `Apparatus`, `exercise.apparatus_ids` |
| Apparatus changes the difficulty | L'apparato cambia la difficoltà | Exercise setting: comparisons, "last time" and records only use sessions on the same apparatus. | `exercise.apparatus_affects_difficulty` |
| Band set | Set di elastici | A brand's or collection's bands (e.g. "Decathlon"), ordered from the lightest to the strongest. | `BandSet` |
| Band | Elastico | One band of a set: name or colour, swatch, and optionally kg at minimum and maximum stretch. | `Band` |
| Tension | Tensione | How far a band is stretched on a set: 1 (little, the minimum kg), 2 (halfway), 3 (a lot, the maximum kg). | `SetBand.tension` |
| Assistance | Assistenza | Kg of help from a set's bands, worked out when logged and saved with the set; unknown when a band has no kg. Less assistance is progress. | `training_set.assist_kg` |
| Notes | Note | Free text. Prescribed-workout notes are planned; workout notes are about this performance. | `UserProgramSession.notes`, `workout.notes` |

## Rules

- Starting a prescribed workout **copies** its name and notes into a new workout. After that the two are
  independent: editing the workout in progress never changes the program, and editing the program
  never changes workouts already started.
- Editing a prescribed workout is done from the program (long press on its name, or the builder).
  Editing the workout in progress is done by long pressing its name on the workout screen.
- The next workout in the rotation is found by the workout's name (`programSessionWorkoutName`), so
  renaming a workout in progress takes it out of the rotation.

- A workout exercise uses the apparatus chosen in the workout, else the exercise default; past workouts
  without one count as done on the default.
- Assistance is compared only in kg; bands without kg make it "unknown" and it is not compared.

## History

- 1 · 2026-10-07: prescribed workout vs workout split; notes on both.
- 2 · 2026-10-07: apparatus, band set, band, tension, assistance.
