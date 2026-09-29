# Training statistics screen + tidier micro-session logger

Date: 2026-09-28

## Goal

Replace the "Daily training totals" screen with a **Statistics** screen that shows training by
pattern or exercise, grouped by session, day, week or month — readable at a glance (a small chart
plus proportional bars), compact, and calm. Also tidy the micro-session logging screen.

## What the user asked for (verbatim intent)

- Tidier "Totali giornalieri" and micro-session sections.
- A dedicated statistics screen: by pattern and by exercise, groupable by session/day/week/month.
- Compact, elegant, not overstimulating UI; statistics "easily and well viewable, also qualitatively".
- Pattern = **both** movement groups and joint tags, but not hard to handle — iterate on UX.
- "Totali giornalieri" is **removed**; the statistics screen replaces it.
- Metrics: working sets, sets ≥ RPE threshold, reps / hold time, loaded volume.
- "Micro-session section" = the logging screen (`app/micro-session.tsx`).

## Assumptions (not stated by the user)

- Weeks start on Monday (local time). Periods use the workout's local start date, as today.
- Only completed working sets of finished workouts count (warm-ups excluded for every metric —
  the old screen counted warm-up hold time; this is a deliberate simplification).
- The chart shows working sets per period; it does not switch metric.
- Distance is not shown (not requested).

## 1. Statistics screen (`app/stats.tsx`)

Layout, top to bottom (one scroll, no nested cards where a divider will do):

```
Statistiche
[ Pattern | Esercizio ]                 SegmentedControl
  Gruppi · Tag                          small text toggle, only when Pattern
[ Sessione | Giorno | Sett. | Mese ]    SegmentedControl
 ‹  Settimana 22–28 set  ›   Oggi       period navigator
 ▁ ▃ ▂ ▅ ▄ ▆ ▃ █                        last 8 periods, working sets; selected bar strong
 14 serie · 5 ≥RPE 8 · 212 rip · 6:40   summary line for the selected period
 ─────────────────────────────────────
 Tirata verticale                  6    row: name + sets (tabular)
 ██████████░░░░░░                       thin bar, width ∝ sets / max row
 48 rip · 2 ≥8 · 120 kg·rep             muted detail, only non-zero parts
 …
 Soglia RPE                    − 8 +    Stepper layout="row", step 0.5, 6–10
```

UX rules:

- **Pattern defaults to "Gruppi"** (6 library groups + "Altro" last). "Tag" is a quiet secondary
  toggle shown only in Pattern mode; it lists only tags with data in the period, plus "Senza tag"
  last. No empty rows in any mode.
- Rows sorted by sets desc, then name. Row value = working sets.
- **Chart**: single series, single hue (accent). 8 columns = the selected period and the 7 before it
  (sessions: the selected session and the 7 before). The selected column uses `accentStrong`, the
  others `accentSoft`; 4px rounded tops anchored to a baseline, 2px gaps, no axis, no grid. Tapping a
  column selects that period (it is the tooltip: the summary line updates). A short label under the
  first and last column only. `accessibilityLabel` per column ("Settimana 22–28 set: 14 serie").
- Row bars: 4px tall, `accentSoft` track-less fill, width ∝ sets / max sets in the list.
- Navigator: ‹ › step one period (or one session); › disabled at the latest; "Oggi" shown only when
  not at the latest period. Session mode label: workout name + date/time.
- Summary line and details show only non-zero metrics; hold time via `formatDuration`; loaded volume
  as `kg·rep` / `kg·s`.
- Empty period: one muted line ("Nessuna serie in questo periodo"), chart still shown.
- Dimension, period kind and threshold persist via `readPreference`/`writePreference`
  (`stats.dimension`, `stats.period`, `stats.threshold`). The anchor always resets to the latest period.
- Loading: existing card + spinner pattern; error: existing retry pattern.
- Strings: local `copy` object {en, it} as in the old screen.

Entry point: the Progress tab button becomes "Statistiche" / "Statistics" (icon `stats-chart-outline`)
and pushes `/stats`.

## 2. Micro-session screen (`app/micro-session.tsx`)

- Top card (always first): selected exercise name + unit, compact −/value/+ target row, full-width
  "Registra" button, inline done/error message.
- "Recenti": up to 5 chips of exercises most recently used in micro-sessions (workouts named
  "Grease the Groove"), tapping selects.
- Search field + compact list: rows ~44px, name + muted unit, selected row marked with a check and
  accent text; no bordered cards. Without a query show 20 rows, with a query up to 50.
- Drops the long explanatory paragraph (keeps the subtitle). Keyboard: `Screen` already uses the
  keyboard-controller scroll view; verify on the emulator with the search field focused.

## 3. Code

- `src/features/analytics/trainingStats.ts` (pure):
  - `StatsRow` input: `{ workoutId, workoutName, workoutStartedAt, exerciseId, exerciseName, metric,
    movementGroup, movementTag, reps, durationSec, addedLoadKg, rpe }` (working sets only).
  - `periodKey(date, kind)`, `shiftPeriod(key, kind, n)`, `periodRange(key, kind)` for day/week/month.
  - `listPeriods(rows, kind)` → ordered period ids (sessions: workout ids by start time).
  - `buildTrainingStats(rows, { dimension: 'group'|'tag'|'exercise', period, anchor, threshold })` →
    `{ anchor, label parts, summary: Metrics, items: { id, name, metrics }[], history: { id, sets }[8],
    hasNewer }`.
  - `Metrics = { sets, setsAtThreshold, reps, holdSeconds, loadRepsKg, loadSecondsKg }`.
- `getTrainingStatsRows()` in `analytics/repository.ts` replaces `getTrainingTotals`.
- `listRecentMicroSessionExerciseIds(limit)` in `session/microSession.ts`.
- Remove `app/training-totals.tsx`, `analytics/trainingTotals.ts` and its test; port the still-valid
  cases (local date keys, RPE threshold, group/tag bucketing) to `trainingStats.test.ts`.

## Verification

- `npm test`, `npm run typecheck`, `npm run lint`.
- Emulator screenshots: stats screen in each dimension and period, light and dark; micro-session
  screen, including the search field focused with the keyboard open.
