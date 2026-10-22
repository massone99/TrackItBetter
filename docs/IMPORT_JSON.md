# Import from JSON

Programs tab → "Import programs from JSON", Mobility hub → Create → "From a JSON file", or Data → "Import from JSON". The app shows what the file
holds before adding anything. Movements that already exist (same name) are reused; routines and programs
are always added as new ones. Examples: `tom-merrick-full-body-mobility.json` (mobility routine), `tom-merrick-full-body-mobility-program.json` (the same workout as a program) and `example-program.json` and `daily-practice-routine-program.json` (a program with one mobility session), all in `docs/import-examples/`.

```jsonc
{
  "format": "trackitbetter-import",
  "version": 1,
  "exercises": [            // custom movements to create; optional
    { "key": "cossack", "name": "Cossack Squats", "metric": "reps" /* reps|time|reps_load|time_load|distance */,
      "category": "mobility" /* push|pull|biceps|triceps|legs|core|skill|mobility|cardio */,
      "unilateral": true, "mobilityMode": "active", "cues": ["..."],
      "images": [ { "data": "<base64 or data: URL>", "mimeType": "image/jpeg", "width": 520, "height": 320 } ] }
  ],
  "mobilityRoutines": [     // optional
    { "name": "Routine", "transitionSec": 5, "prepSec": 5,
      "steps": [ { "exercise": "cossack", "mode": "reps" /* or hold */, "reps": 5, "seconds": 30,
                   "rounds": 1, "perSide": true, "restSec": 0 } ] }
  ],
  "programs": [             // optional, not only mobility
    { "name": "Pull", "sessions": [ { "name": "A", "notes": null,
        "exercises": [ { "exercise": "pull-up", "sets": 3, "target": 6, "restSeconds": 120,
                         "loadKg": null, "rpe": 8, "rpePerSet": null, "note": null, "totalTarget": null } ] } ] }
  ]
}
```

`exercise` in a step or program is a `key` of this file, the id of an exercise in the app, or its name.

`images` are shown on the exercise page. They are added to a movement that already exists too (matched by name), after its own
images; an image already added by an earlier import (same data) is skipped. So a file with only `exercises` and their `images`
works as an addendum: importing it adds just the missing pictures and creates nothing else.
