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

## Progression chains and relations

```jsonc
  "chains": [               // optional: chains of exercises, easier first
    { "key": "my-planche", "name": "My planche path", "description": "...", "skill": "Planche",
      "steps": [ { "exercise": "frog-stand", "criteria": { "sets": 3, "seconds": 30, "requiredSessions": 2 } },
                 { "exercise": "tuck-planche", "criteria": null } ] }
  ],
  "links": [                // optional: single relations between two exercises
    { "from": "push-up", "to": "planche-lean", "kind": "prerequisite" /* progression|prerequisite|variation */,
      "criteria": { "sets": 3, "reps": 15 }, "note": "..." }
  ]
```

`criteria` is what to reach before moving on: `sets` of `reps` or of `seconds` (one of the two), over
`requiredSessions` sessions in a row (default 1); `null` for none. A `progression` goes from the easier
exercise (`from`) to the harder one (`to`); a `prerequisite` is needed before `to`; a `variation` has no direction.

Importing is additive and can be repeated: a chain whose name is already in the app gets only the steps it
lacks (at the end), a relation already there is skipped, and the preview lists what will be added. A file
that would make a loop (A → B → A) is refused, naming the exercises. In the app, Progressions → Export
writes the same format (with each exercise's `id`, so it is matched exactly when imported on the same
device); example: `docs/import-examples/example-chains.json`.
