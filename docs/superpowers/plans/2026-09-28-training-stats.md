# Training Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "Daily training totals" with a calm, compact Statistics screen (pattern/exercise × session/day/week/month, with a small period chart and proportional row bars) and tidy the micro-session logger.

**Architecture:** All aggregation lives in one pure module (`trainingStats.ts`) fed by one flat SQL query of completed working sets; the screen loads the rows once per focus and recomputes stats in memory on every control change, so navigation is instant. Presentation helpers (period labels, the bar chart) are small separate files.

**Tech Stack:** Expo 57 / React Native, expo-router, drizzle-orm + expo-sqlite, react-i18next, Jest (`jest-expo`).

**Spec:** `docs/superpowers/specs/2026-09-28-training-stats-design.md`

## Global Constraints

- Only completed working sets (`trainingSets.kind = 'working'`, `completedAt` not null) of finished workouts (`workouts.endedAt` not null) count.
- Periods use the workout's local start date; weeks start on Monday.
- Chart: single hue — selected column `palette.accentStrong`, others `palette.accentSoft`, empty columns `palette.border`; 4px rounded tops, no axis, no grid; 8 columns.
- Pattern defaults to groups; tag view lists only tags with data; "Other"/"No tag" rows always last; no zero rows.
- Screen copy lives in a local `copy = { en, it }` object (existing pattern); shared keys go in `src/shared/i18n/resources.ts` for both locales (a test enforces parity).
- Keyboard must never cover focused inputs: `Screen` already scrolls with `react-native-keyboard-controller`; verify with the keyboard open on the emulator.
- Preferences keys: `stats.view`, `stats.patternKind`, `stats.period`, `stats.threshold` via `readPreference`/`writePreference`.

## Review Focus

1. No finished workouts at all → session mode has no period; screen shows an empty message, arrows disabled, no crash (test in Task 1).
2. Week containing a Sunday / spanning a year boundary → Sunday belongs to the week of the previous Monday; 1 Jan 2027 belongs to week `2026-12-28` (test in Task 1).
3. Pressing › at the latest period → `newerId` is null and the button is disabled (test in Task 1).
4. Sets with `reps`/`durationSec` null or negative → still count as sets, contribute 0 volume (test in Task 1).
5. Recent micro-session exercise that was later archived/deleted → silently skipped in "Recent" (test in Task 4).

## File Structure

- Create `src/features/analytics/trainingStats.ts` — pure aggregation + period math.
- Create `src/features/analytics/__tests__/trainingStats.test.ts`.
- Create `src/features/analytics/periodLabels.ts` — locale-aware period labels.
- Create `src/features/analytics/__tests__/periodLabels.test.ts`.
- Create `src/features/analytics/PeriodBars.tsx` — 8-column tappable bar chart.
- Create `app/stats.tsx` — the Statistics screen.
- Modify `src/features/analytics/repository.ts` — `getTrainingStatsRows()` replaces `getTrainingTotals()`.
- Modify `app/(tabs)/progress.tsx` — entry button.
- Modify `src/features/session/microSession.ts` — `listRecentMicroSessionExerciseIds()`, `pickRecent()`.
- Create `src/features/session/__tests__/microSession.test.ts`.
- Modify `app/micro-session.tsx` — new layout.
- Modify `src/shared/i18n/resources.ts` — `micro.recent`, drop `micro.detail`.
- Delete `app/training-totals.tsx`, `src/features/analytics/trainingTotals.ts`, `src/features/analytics/__tests__/trainingTotals.test.ts`.

---

### Task 0: Branch and existing work

The working tree on `main` holds uncommitted work (the training-totals screen, movement classification, etc.). Several files this plan edits (`repository.ts`, `progress.tsx`, `resources.ts`) contain it.

- [ ] **Step 1:** Ask the user whether to commit that existing work first (as its own commit) on a new branch `feat/training-stats`. Do not commit it without a yes.
- [ ] **Step 2:** `git switch -c feat/training-stats` (the uncommitted changes carry over).

---

### Task 1: Pure statistics module

**Files:**
- Create: `src/features/analytics/trainingStats.ts`
- Test: `src/features/analytics/__tests__/trainingStats.test.ts`

**Interfaces:**
- Produces:
  - `type StatsDimension = 'group' | 'tag' | 'exercise'`
  - `type StatsPeriodKind = 'session' | 'day' | 'week' | 'month'`
  - `const OTHER_ID = '__other__'`
  - `interface StatsSetRow { workoutId: string; workoutName: string; workoutStartedAt: Date; exerciseId: string; exerciseName: string; metric: string; movementGroup: string | null; movementTag: string | null; reps: number | null; durationSec: number | null; addedLoadKg: number; rpe: number | null }`
  - `interface StatsMetrics { sets; setsAtThreshold; reps; holdSeconds; loadRepsKg; loadSecondsKg }` (all `number`)
  - `interface StatsItem { id: string; name: string; metrics: StatsMetrics }`
  - `interface StatsPeriod { id: string; start: Date; end: Date; workoutName: string | null }` (`end` = last day, inclusive; for sessions `end === start`)
  - `interface StatsBar { id: string; start: Date; sets: number }`
  - `interface TrainingStats { period: StatsPeriod | null; summary: StatsMetrics; items: StatsItem[]; history: StatsBar[]; olderId: string | null; newerId: string | null }`
  - `buildTrainingStats(rows: readonly StatsSetRow[], options: { dimension: StatsDimension; period: StatsPeriodKind; anchor: string | null; threshold: number; now?: Date }): TrainingStats`
  - `periodId(date: Date, kind: 'day' | 'week' | 'month'): string` — day/week: `YYYY-MM-DD` of the period's first day; month: `YYYY-MM`.

- [ ] **Step 1: Write the failing tests**

```ts
import { buildTrainingStats, OTHER_ID, periodId, type StatsSetRow } from '../trainingStats';

const at = (year: number, month: number, day: number, hour = 10) => new Date(year, month - 1, day, hour);
const now = at(2026, 9, 28, 20); // Monday

function row(overrides: Partial<StatsSetRow>): StatsSetRow {
  return {
    workoutId: 'w1', workoutName: 'Workout', workoutStartedAt: at(2026, 9, 28),
    exerciseId: 'push', exerciseName: 'Push-up', metric: 'reps',
    movementGroup: 'horizontal-push', movementTag: null,
    reps: 10, durationSec: null, addedLoadKg: 0, rpe: null,
    ...overrides,
  };
}

const weekRows = [
  row({ rpe: 8 }),
  row({ exerciseId: 'pull', exerciseName: 'Weighted pull-up', metric: 'reps_load', movementGroup: 'vertical-pull', reps: 5, addedLoadKg: 10, rpe: 9 }),
  row({ exerciseId: 'pull', exerciseName: 'Weighted pull-up', metric: 'reps_load', movementGroup: 'vertical-pull', reps: 5, addedLoadKg: 10, rpe: 9 }),
  row({ exerciseId: 'hold', exerciseName: 'Hang', metric: 'time_load', movementGroup: null, movementTag: 'Shoulder flexion', reps: null, durationSec: 30, addedLoadKg: 5 }),
  row({ workoutId: 'w0', workoutStartedAt: at(2026, 9, 21), reps: 8 }),
];

describe('periodId', () => {
  it('keys days, Monday-based weeks and months on local dates', () => {
    expect(periodId(at(2026, 9, 28), 'day')).toBe('2026-09-28');
    expect(periodId(at(2026, 9, 27), 'week')).toBe('2026-09-21'); // Sunday → previous Monday
    expect(periodId(at(2026, 9, 28), 'week')).toBe('2026-09-28');
    expect(periodId(at(2027, 1, 1), 'week')).toBe('2026-12-28'); // across the year boundary
    expect(periodId(at(2026, 9, 28), 'month')).toBe('2026-09');
    expect(periodId(new Date(2026, 0, 2, 23, 59), 'day')).toBe('2026-01-02');
  });
});

describe('buildTrainingStats', () => {
  it('aggregates the current week by movement group with Other last', () => {
    const stats = buildTrainingStats(weekRows, { dimension: 'group', period: 'week', anchor: null, threshold: 8, now });

    expect(stats.period).toMatchObject({ id: '2026-09-28', workoutName: null });
    expect(stats.period?.end).toEqual(at(2026, 10, 4, 0));
    expect(stats.summary).toEqual({ sets: 4, setsAtThreshold: 3, reps: 20, holdSeconds: 30, loadRepsKg: 100, loadSecondsKg: 150 });
    expect(stats.items.map((item) => item.id)).toEqual(['vertical-pull', 'horizontal-push', OTHER_ID]);
    expect(stats.items[0].metrics).toMatchObject({ sets: 2, reps: 10, loadRepsKg: 100, setsAtThreshold: 2 });
    expect(stats.history).toHaveLength(8);
    expect(stats.history.slice(-2).map(({ id, sets }) => ({ id, sets }))).toEqual([{ id: '2026-09-21', sets: 1 }, { id: '2026-09-28', sets: 4 }]);
    expect(stats.newerId).toBeNull();
    expect(stats.olderId).toBe('2026-09-21');
  });

  it('lists only tags with data, untagged last', () => {
    const stats = buildTrainingStats(weekRows, { dimension: 'tag', period: 'week', anchor: null, threshold: 8, now });
    expect(stats.items.map((item) => item.id)).toEqual(['Shoulder flexion', OTHER_ID]);
    expect(stats.items.find((item) => item.id === 'Shoulder flexion')?.metrics.holdSeconds).toBe(30);
  });

  it('groups by exercise with names, most sets first', () => {
    const stats = buildTrainingStats(weekRows, { dimension: 'exercise', period: 'week', anchor: null, threshold: 8, now });
    expect(stats.items.map((item) => item.name)).toEqual(['Weighted pull-up', 'Hang', 'Push-up']);
  });

  it('navigates older periods and exposes the newer one', () => {
    const stats = buildTrainingStats(weekRows, { dimension: 'group', period: 'day', anchor: '2026-09-21', threshold: 8, now });
    expect(stats.summary.sets).toBe(1);
    expect(stats.newerId).toBe('2026-09-22');
    expect(stats.olderId).toBeNull();
  });

  it('clamps an anchor in the future to the latest period', () => {
    const stats = buildTrainingStats(weekRows, { dimension: 'group', period: 'month', anchor: '2027-01', threshold: 8, now });
    expect(stats.period?.id).toBe('2026-09');
    expect(stats.newerId).toBeNull();
  });

  it('steps through sessions one workout at a time', () => {
    const latest = buildTrainingStats(weekRows, { dimension: 'group', period: 'session', anchor: null, threshold: 8, now });
    expect(latest.period).toMatchObject({ id: 'w1', workoutName: 'Workout' });
    expect(latest.olderId).toBe('w0');
    expect(latest.newerId).toBeNull();
    expect(latest.history.map((bar) => bar.id)).toEqual(['w0', 'w1']);

    const older = buildTrainingStats(weekRows, { dimension: 'group', period: 'session', anchor: 'w0', threshold: 8, now });
    expect(older.summary.sets).toBe(1);
    expect(older.newerId).toBe('w1');
    expect(older.olderId).toBeNull();
  });

  it('handles no data without a period for sessions and zeros for calendar periods', () => {
    const sessions = buildTrainingStats([], { dimension: 'group', period: 'session', anchor: null, threshold: 8, now });
    expect(sessions).toMatchObject({ period: null, items: [], history: [], olderId: null, newerId: null });

    const days = buildTrainingStats([], { dimension: 'group', period: 'day', anchor: null, threshold: 8, now });
    expect(days.period?.id).toBe('2026-09-28');
    expect(days.summary.sets).toBe(0);
    expect(days.history.every((bar) => bar.sets === 0)).toBe(true);
    expect(days.olderId).toBeNull();
  });

  it('counts sets with missing or negative values without adding volume', () => {
    const stats = buildTrainingStats([
      row({ reps: null, addedLoadKg: 20 }),
      row({ exerciseId: 'hold', metric: 'time', durationSec: -5 }),
      row({ rpe: 7.5 }),
    ], { dimension: 'exercise', period: 'day', anchor: null, threshold: 8, now });
    expect(stats.summary).toEqual({ sets: 3, setsAtThreshold: 0, reps: 10, holdSeconds: 0, loadRepsKg: 0, loadSecondsKg: 0 });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jest src/features/analytics/__tests__/trainingStats.test.ts`
Expected: FAIL — `Cannot find module '../trainingStats'`.

- [ ] **Step 3: Implement**

```ts
import { canonicalizeMovementTag, MOVEMENT_GROUP_IDS } from '../exercises/movementCatalog';

export type StatsDimension = 'group' | 'tag' | 'exercise';
export type StatsPeriodKind = 'session' | 'day' | 'week' | 'month';
type CalendarKind = Exclude<StatsPeriodKind, 'session'>;

/** Bucket for sets whose exercise has no movement group (or no tag, in tag view). */
export const OTHER_ID = '__other__';
const HISTORY_LENGTH = 8;

export interface StatsSetRow {
  workoutId: string;
  workoutName: string;
  workoutStartedAt: Date;
  exerciseId: string;
  exerciseName: string;
  metric: string;
  movementGroup: string | null;
  movementTag: string | null;
  reps: number | null;
  durationSec: number | null;
  addedLoadKg: number;
  rpe: number | null;
}

export interface StatsMetrics { sets: number; setsAtThreshold: number; reps: number; holdSeconds: number; loadRepsKg: number; loadSecondsKg: number }
export interface StatsItem { id: string; name: string; metrics: StatsMetrics }
/** `end` is the last day of the period (inclusive); for a session it equals `start`. */
export interface StatsPeriod { id: string; start: Date; end: Date; workoutName: string | null }
export interface StatsBar { id: string; start: Date; sets: number }
export interface TrainingStats {
  period: StatsPeriod | null;
  summary: StatsMetrics;
  items: StatsItem[];
  history: StatsBar[];
  olderId: string | null;
  newerId: string | null;
}
export interface StatsOptions { dimension: StatsDimension; period: StatsPeriodKind; anchor: string | null; threshold: number; now?: Date }

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromKey(key: string): Date {
  const [year, month, day = 1] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function periodStart(date: Date, kind: CalendarKind): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), kind === 'month' ? 1 : date.getDate());
  if (kind === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export function periodId(date: Date, kind: CalendarKind): string {
  const key = localDateKey(periodStart(date, kind));
  return kind === 'month' ? key.slice(0, 7) : key;
}

function shiftPeriod(id: string, kind: CalendarKind, steps: number): string {
  const start = dateFromKey(id);
  if (kind === 'month') start.setMonth(start.getMonth() + steps);
  else start.setDate(start.getDate() + steps * (kind === 'week' ? 7 : 1));
  return periodId(start, kind);
}

function periodEnd(start: Date, kind: CalendarKind): Date {
  if (kind === 'month') return new Date(start.getFullYear(), start.getMonth() + 1, 0);
  const end = new Date(start);
  if (kind === 'week') end.setDate(end.getDate() + 6);
  return end;
}

export function buildTrainingStats(rows: readonly StatsSetRow[], options: StatsOptions): TrainingStats {
  if (options.period === 'session') return buildSessionStats(rows, options);
  const kind = options.period;
  const latest = periodId(options.now ?? new Date(), kind);
  const anchor = options.anchor && options.anchor <= latest ? options.anchor : latest;
  const idOf = (row: StatsSetRow) => periodId(row.workoutStartedAt, kind);
  const setsByPeriod = new Map<string, number>();
  for (const row of rows) setsByPeriod.set(idOf(row), (setsByPeriod.get(idOf(row)) ?? 0) + 1);
  const start = dateFromKey(anchor);
  const history = Array.from({ length: HISTORY_LENGTH }, (_, index) => shiftPeriod(anchor, kind, index - (HISTORY_LENGTH - 1)));
  return {
    period: { id: anchor, start, end: periodEnd(start, kind), workoutName: null },
    ...aggregate(rows.filter((row) => idOf(row) === anchor), options),
    history: history.map((id) => ({ id, start: dateFromKey(id), sets: setsByPeriod.get(id) ?? 0 })),
    olderId: rows.some((row) => idOf(row) < anchor) ? shiftPeriod(anchor, kind, -1) : null,
    newerId: anchor < latest ? shiftPeriod(anchor, kind, 1) : null,
  };
}

function buildSessionStats(rows: readonly StatsSetRow[], options: StatsOptions): TrainingStats {
  const sessions = new Map<string, { start: Date; name: string; sets: number }>();
  for (const row of rows) {
    const session = sessions.get(row.workoutId);
    if (session) session.sets += 1;
    else sessions.set(row.workoutId, { start: row.workoutStartedAt, name: row.workoutName, sets: 1 });
  }
  const ordered = [...sessions].sort(([, a], [, b]) => a.start.getTime() - b.start.getTime());
  if (ordered.length === 0) return { period: null, ...aggregate([], options), history: [], olderId: null, newerId: null };
  const found = ordered.findIndex(([id]) => id === options.anchor);
  const index = found >= 0 ? found : ordered.length - 1;
  const [id, session] = ordered[index];
  return {
    period: { id, start: session.start, end: session.start, workoutName: session.name },
    ...aggregate(rows.filter((row) => row.workoutId === id), options),
    history: ordered.slice(Math.max(0, index - HISTORY_LENGTH + 1), index + 1).map(([barId, bar]) => ({ id: barId, start: bar.start, sets: bar.sets })),
    olderId: index > 0 ? ordered[index - 1][0] : null,
    newerId: index < ordered.length - 1 ? ordered[index + 1][0] : null,
  };
}

function aggregate(rows: readonly StatsSetRow[], { dimension, threshold }: StatsOptions): { summary: StatsMetrics; items: StatsItem[] } {
  const summary = emptyMetrics();
  const items = new Map<string, StatsItem>();
  for (const row of rows) {
    const [id, name] = itemKey(row, dimension);
    let item = items.get(id);
    if (!item) {
      item = { id, name, metrics: emptyMetrics() };
      items.set(id, item);
    }
    addSet(summary, row, threshold);
    addSet(item.metrics, row, threshold);
  }
  return { summary, items: [...items.values()].sort(compareItems) };
}

function itemKey(row: StatsSetRow, dimension: StatsDimension): [string, string] {
  if (dimension === 'exercise') return [row.exerciseId, row.exerciseName];
  const value = dimension === 'group'
    ? ((MOVEMENT_GROUP_IDS as readonly string[]).includes(row.movementGroup ?? '') ? row.movementGroup : null)
    : canonicalizeMovementTag(row.movementTag);
  return value ? [value, value] : [OTHER_ID, OTHER_ID];
}

function addSet(metrics: StatsMetrics, row: StatsSetRow, threshold: number) {
  metrics.sets += 1;
  if (row.rpe != null && row.rpe >= threshold) metrics.setsAtThreshold += 1;
  const load = Math.max(0, row.addedLoadKg);
  if (row.metric === 'reps' || row.metric === 'reps_load') {
    const reps = Math.max(0, row.reps ?? 0);
    metrics.reps += reps;
    metrics.loadRepsKg += load * reps;
  }
  if (row.metric === 'time' || row.metric === 'time_load') {
    const seconds = Math.max(0, row.durationSec ?? 0);
    metrics.holdSeconds += seconds;
    metrics.loadSecondsKg += load * seconds;
  }
}

function compareItems(a: StatsItem, b: StatsItem): number {
  if ((a.id === OTHER_ID) !== (b.id === OTHER_ID)) return a.id === OTHER_ID ? 1 : -1;
  return b.metrics.sets - a.metrics.sets || a.name.localeCompare(b.name);
}

function emptyMetrics(): StatsMetrics {
  return { sets: 0, setsAtThreshold: 0, reps: 0, holdSeconds: 0, loadRepsKg: 0, loadSecondsKg: 0 };
}
```

Exercise-order check for the exercise test: pull 2 sets, then Hang (1) and Push-up (1) tie → name order `Hang`, `Push-up`. Matches.

- [ ] **Step 4: Run tests**

Run: `npx jest src/features/analytics/__tests__/trainingStats.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics/trainingStats.ts src/features/analytics/__tests__/trainingStats.test.ts
git commit -m "Add pure training statistics aggregation"
```

---

### Task 2: Period labels and bar chart

**Files:**
- Create: `src/features/analytics/periodLabels.ts`
- Create: `src/features/analytics/PeriodBars.tsx`
- Test: `src/features/analytics/__tests__/periodLabels.test.ts`

**Interfaces:**
- Consumes: `StatsPeriod`, `StatsPeriodKind`, `StatsBar` from Task 1.
- Produces:
  - `formatPeriod(period: StatsPeriod, kind: StatsPeriodKind, locale: string): string`
  - `formatPeriodShort(start: Date, kind: StatsPeriodKind, locale: string): string`
  - `PeriodBars(props: { bars: StatsBar[]; selectedId: string; onSelect: (id: string) => void; describe: (bar: StatsBar) => string; firstLabel: string; lastLabel: string })`

- [ ] **Step 1: Failing test**

```ts
import { formatPeriod, formatPeriodShort } from '../periodLabels';

const period = (start: Date, end: Date, workoutName: string | null = null) => ({ id: 'x', start, end, workoutName });

describe('period labels', () => {
  it('writes a week inside one month compactly and across months in full', () => {
    expect(formatPeriod(period(new Date(2026, 8, 21), new Date(2026, 8, 27)), 'week', 'en')).toBe('21–27 Sep');
    expect(formatPeriod(period(new Date(2026, 8, 28), new Date(2026, 9, 4)), 'week', 'en')).toBe('28 Sep – 4 Oct');
    expect(formatPeriod(period(new Date(2026, 8, 21), new Date(2026, 8, 27)), 'week', 'it')).toBe('21–27 set');
  });

  it('capitalises months and names sessions', () => {
    expect(formatPeriod(period(new Date(2026, 8, 1), new Date(2026, 8, 30)), 'month', 'it')).toBe('Settembre 2026');
    expect(formatPeriod(period(new Date(2026, 8, 28, 7, 5), new Date(2026, 8, 28, 7, 5), 'Grease the Groove'), 'session', 'en')).toMatch(/^Grease the Groove · 28 Sep/);
  });

  it('keeps chart labels short', () => {
    expect(formatPeriodShort(new Date(2026, 8, 28), 'day', 'en')).toBe('28 Sep');
    expect(formatPeriodShort(new Date(2026, 8, 1), 'month', 'it')).toBe('set');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jest src/features/analytics/__tests__/periodLabels.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `periodLabels.ts`**

```ts
import type { StatsPeriod, StatsPeriodKind } from './trainingStats';

const monthShort = (date: Date, locale: string) => new Intl.DateTimeFormat(locale, { month: 'short' }).format(date).replace('.', '');
const dayMonth = (date: Date, locale: string) => `${date.getDate()} ${monthShort(date, locale)}`;
const capitalise = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** Navigator label for the selected period, e.g. "21–27 Sep", "Settembre 2026". */
export function formatPeriod(period: StatsPeriod, kind: StatsPeriodKind, locale: string): string {
  const { start, end } = period;
  if (kind === 'session') {
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(start);
    return `${period.workoutName ?? ''} · ${dayMonth(start, locale)}, ${time}`;
  }
  if (kind === 'day') {
    return `${capitalise(new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(start).replace('.', ''))} ${dayMonth(start, locale)}`;
  }
  if (kind === 'week') {
    return start.getMonth() === end.getMonth()
      ? `${start.getDate()}–${end.getDate()} ${monthShort(end, locale)}`
      : `${dayMonth(start, locale)} – ${dayMonth(end, locale)}`;
  }
  return capitalise(new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(start));
}

/** Tiny label under the first and last chart column. */
export function formatPeriodShort(start: Date, kind: StatsPeriodKind, locale: string): string {
  return kind === 'month' ? monthShort(start, locale) : dayMonth(start, locale);
}
```

- [ ] **Step 4: Run test** → PASS (Node 20 ICU prints `Sep` / `set` / `settembre 2026`, checked).

- [ ] **Step 5: Implement `PeriodBars.tsx`** (no unit test; verified visually in Task 6)

```tsx
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../shared/components/Text';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import type { StatsBar } from './trainingStats';

const CHART_HEIGHT = 56;

/** Working sets per period, one hue; tapping a column selects that period. */
export function PeriodBars({ bars, selectedId, onSelect, describe, firstLabel, lastLabel }: {
  bars: StatsBar[];
  selectedId: string;
  onSelect: (id: string) => void;
  describe: (bar: StatsBar) => string;
  firstLabel: string;
  lastLabel: string;
}) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const max = Math.max(1, ...bars.map((bar) => bar.sets));
  return <View>
    <View style={styles.bars}>
      {bars.map((bar) => {
        const selected = bar.id === selectedId;
        const height = bar.sets === 0 ? 2 : Math.max(4, Math.round((bar.sets / max) * CHART_HEIGHT));
        return <Pressable key={bar.id} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={describe(bar)} hitSlop={4} onPress={() => onSelect(bar.id)} style={styles.column}>
          <View style={[styles.bar, { height, backgroundColor: bar.sets === 0 ? palette.border : selected ? palette.accentStrong : palette.accentSoft }]} />
        </Pressable>;
      })}
    </View>
    <View style={[styles.baseline, { backgroundColor: palette.border }]} />
    <View style={styles.labels}>
      <Text style={[styles.label, { color: palette.textMuted }]}>{firstLabel}</Text>
      <Text style={[styles.label, { color: palette.textMuted }]}>{lastLabel}</Text>
    </View>
  </View>;
}

const baseStyles = StyleSheet.create({
  bars: { height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  column: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  baseline: { height: StyleSheet.hairlineWidth },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  label: { fontSize: 12 },
});
```

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck` → no errors in these files.

```bash
git add src/features/analytics/periodLabels.ts src/features/analytics/PeriodBars.tsx src/features/analytics/__tests__/periodLabels.test.ts
git commit -m "Add period labels and period bar chart for statistics"
```

---

### Task 3: Data query, Statistics screen, remove Daily totals

**Files:**
- Modify: `src/features/analytics/repository.ts` (replace `getTrainingTotals`, lines ~50-71; drop the `trainingTotals` and `MOVEMENT_TAGS` imports)
- Create: `app/stats.tsx`
- Modify: `app/(tabs)/progress.tsx` (copy keys `trainingTotals` in en/it, button at line ~66)
- Delete: `app/training-totals.tsx`, `src/features/analytics/trainingTotals.ts`, `src/features/analytics/__tests__/trainingTotals.test.ts`

**Interfaces:**
- Consumes: Task 1 `buildTrainingStats`, types, `OTHER_ID`; Task 2 `formatPeriod`, `formatPeriodShort`, `PeriodBars`.
- Produces: `getTrainingStatsRows(): Promise<StatsSetRow[]>`; route `/stats`.

- [ ] **Step 1: Repository query** — replace `getTrainingTotals` with:

```ts
/** Completed working sets of finished workouts, flat, for the statistics screen. */
export async function getTrainingStatsRows(): Promise<StatsSetRow[]> {
  await initializeDatabase();
  return db.select({
    workoutId: workouts.id,
    workoutName: workouts.name,
    workoutStartedAt: workouts.startedAt,
    exerciseId: exercises.id,
    exerciseName: exercises.name,
    metric: exercises.metric,
    movementGroup: exercises.movementGroup,
    movementTag: exercises.movementTag,
    reps: trainingSets.reps,
    durationSec: trainingSets.durationSec,
    addedLoadKg: trainingSets.addedLoadKg,
    rpe: trainingSets.rpe,
  }).from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(isNotNull(workouts.endedAt), isNotNull(trainingSets.completedAt), eq(trainingSets.kind, 'working')));
}
```

Imports: `import type { StatsSetRow } from './trainingStats';`; remove `buildTrainingTotals`/`TrainingTotals` and `MOVEMENT_TAGS` imports.

- [ ] **Step 2: Delete the old screen and module**

```bash
rm app/training-totals.tsx src/features/analytics/trainingTotals.ts src/features/analytics/__tests__/trainingTotals.test.ts
grep -rn "training-totals\|trainingTotals\|getTrainingTotals" app src
```
Expected: only `app/(tabs)/progress.tsx` matches (fixed next step).

- [ ] **Step 3: Progress entry** — in `app/(tabs)/progress.tsx` replace `trainingTotals: 'Daily training totals',` with `stats: 'Statistics',`, `trainingTotals: 'Totali giornalieri',` with `stats: 'Statistiche',`, and the button with:

```tsx
<ActionButton label={strings.stats} variant="secondary" icon="stats-chart-outline" onPress={() => router.push('/stats')} />
```

- [ ] **Step 4: Create `app/stats.tsx`**

```tsx
import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Body, Card, Heading, IconButton, PageHeading, Screen, SegmentedControl, Stepper } from '../src/shared/components/ui';
import { Text } from '../src/shared/components/Text';
import { getTrainingStatsRows } from '../src/features/analytics/repository';
import { buildTrainingStats, OTHER_ID, type StatsDimension, type StatsMetrics, type StatsPeriodKind, type StatsSetRow } from '../src/features/analytics/trainingStats';
import { formatPeriod, formatPeriodShort } from '../src/features/analytics/periodLabels';
import { PeriodBars } from '../src/features/analytics/PeriodBars';
import { movementTagLabel } from '../src/features/exercises/ClassificationChoices';
import { readPreference, writePreference } from '../src/shared/settings/preferences';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';
import { formatDuration, formatNumber } from '../src/shared/utils/format';

const copy = {
  en: {
    title: 'Statistics', subtitle: 'Working sets by pattern or exercise.',
    pattern: 'Pattern', exercise: 'Exercise', groups: 'Groups', tags: 'Tags',
    session: 'Session', day: 'Day', week: 'Week', month: 'Month',
    previous: 'Previous period', next: 'Next period', today: 'Today', latestSession: 'Latest',
    set: 'set', sets: 'sets', reps: 'reps', threshold: 'RPE threshold',
    empty: 'No working sets in this period.', noData: 'Finish a workout to see statistics here.',
    other: 'Other movements', untagged: 'No tag', loading: 'Loading statistics…', error: 'Statistics could not be loaded.', retry: 'Retry',
  },
  it: {
    title: 'Statistiche', subtitle: 'Serie di lavoro per pattern o esercizio.',
    pattern: 'Pattern', exercise: 'Esercizio', groups: 'Gruppi', tags: 'Tag',
    session: 'Sessione', day: 'Giorno', week: 'Sett.', month: 'Mese',
    previous: 'Periodo precedente', next: 'Periodo successivo', today: 'Oggi', latestSession: 'Ultima',
    set: 'serie', sets: 'serie', reps: 'rip', threshold: 'Soglia RPE',
    empty: 'Nessuna serie di lavoro in questo periodo.', noData: 'Completa un allenamento per vedere qui le statistiche.',
    other: 'Altri movimenti', untagged: 'Senza tag', loading: 'Caricamento statistiche…', error: 'Impossibile caricare le statistiche.', retry: 'Riprova',
  },
} as const;
type Strings = (typeof copy)['en'] | (typeof copy)['it'];

type StatsView = 'pattern' | 'exercise';
type PatternKind = 'group' | 'tag';
const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  const value = readPreference(key);
  return allowed.includes(value as T) ? value as T : fallback;
};

export default function StatsScreen() {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.language.toLowerCase().startsWith('it') ? 'it' : 'en';
  const strings = copy[locale];
  const [rows, setRows] = useState<StatsSetRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<StatsView>(() => pick('stats.view', ['pattern', 'exercise'], 'pattern'));
  const [patternKind, setPatternKind] = useState<PatternKind>(() => pick('stats.patternKind', ['group', 'tag'], 'group'));
  const [periodKind, setPeriodKind] = useState<StatsPeriodKind>(() => pick('stats.period', ['session', 'day', 'week', 'month'], 'week'));
  const [threshold, setThreshold] = useState(() => {
    const stored = Number(readPreference('stats.threshold'));
    return stored >= 6 && stored <= 10 ? stored : 8;
  });
  const [anchor, setAnchor] = useState<string | null>(null);

  const load = useCallback(() => {
    let active = true;
    setFailed(false);
    getTrainingStatsRows().then((result) => { if (active) setRows(result); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  useFocusEffect(load);

  const dimension: StatsDimension = view === 'exercise' ? 'exercise' : patternKind;
  const stats = useMemo(() => rows ? buildTrainingStats(rows, { dimension, period: periodKind, anchor, threshold }) : null, [rows, dimension, periodKind, anchor, threshold]);

  const remember = <T extends string>(key: string, setter: (value: T) => void) => (value: T) => {
    setter(value);
    writePreference(key, value);
    setAnchor(null);
  };
  const changeThreshold = (value: number) => { setThreshold(value); writePreference('stats.threshold', String(value)); };

  const itemName = (id: string, name: string) => {
    if (dimension === 'exercise') return name;
    if (id === OTHER_ID) return dimension === 'tag' ? strings.untagged : strings.other;
    return dimension === 'group' ? t(`movement.groups.${id}`) : movementTagLabel(id, t);
  };
  const maxSets = Math.max(1, ...(stats?.items.map((item) => item.metrics.sets) ?? [1]));

  return <Screen>
    <PageHeading title={strings.title} subtitle={strings.subtitle} />
    <View style={styles.controls}>
      <SegmentedControl value={view} onChange={remember('stats.view', setView)} options={[{ value: 'pattern', label: strings.pattern }, { value: 'exercise', label: strings.exercise }]} />
      {view === 'pattern' && <View style={styles.quietToggle}>
        {(['group', 'tag'] as const).map((kind, index) => <View key={kind} style={styles.quietItem}>
          {index > 0 && <Text style={{ color: palette.textMuted }}>·</Text>}
          <Pressable accessibilityRole="button" accessibilityState={{ selected: patternKind === kind }} hitSlop={10} onPress={() => remember('stats.patternKind', setPatternKind)(kind)}>
            <Text style={[styles.quietText, { color: patternKind === kind ? palette.text : palette.textMuted, fontFamily: patternKind === kind ? 'Barlow_600SemiBold' : undefined }]}>{kind === 'group' ? strings.groups : strings.tags}</Text>
          </Pressable>
        </View>)}
      </View>}
      <SegmentedControl value={periodKind} onChange={remember('stats.period', setPeriodKind)} options={(['session', 'day', 'week', 'month'] as const).map((value) => ({ value, label: strings[value] }))} />
    </View>

    {!stats ? <Card style={styles.loadingCard}>
      {failed ? <Pressable accessibilityRole="button" onPress={load}><Heading>{strings.error}</Heading><Body>{strings.retry}</Body></Pressable>
        : <><ActivityIndicator color={palette.accentStrong} /><Body>{strings.loading}</Body></>}
    </Card> : !stats.period ? <Card><Body>{strings.noData}</Body></Card> : <>
      <Card>
        <View style={styles.navigator}>
          <View style={{ opacity: stats.olderId ? 1 : 0.3 }} pointerEvents={stats.olderId ? 'auto' : 'none'}>
            <IconButton icon="chevron-back" label={strings.previous} onPress={() => stats.olderId && setAnchor(stats.olderId)} />
          </View>
          <Text numberOfLines={1} accessibilityLiveRegion="polite" style={[styles.periodLabel, { color: palette.text }]}>{formatPeriod(stats.period, periodKind, locale)}</Text>
          <View style={{ opacity: stats.newerId ? 1 : 0.3 }} pointerEvents={stats.newerId ? 'auto' : 'none'}>
            <IconButton icon="chevron-forward" label={strings.next} onPress={() => stats.newerId && setAnchor(stats.newerId)} />
          </View>
        </View>
        {stats.newerId && <Pressable accessibilityRole="button" onPress={() => setAnchor(null)} style={styles.latest}>
          <Text style={[styles.latestText, { color: palette.accentStrong }]}>{periodKind === 'session' ? strings.latestSession : strings.today}</Text>
        </Pressable>}
        <PeriodBars
          bars={stats.history}
          selectedId={stats.period.id}
          onSelect={setAnchor}
          describe={(bar) => `${formatPeriodShort(bar.start, periodKind, locale)}: ${bar.sets} ${bar.sets === 1 ? strings.set : strings.sets}`}
          firstLabel={stats.history.length ? formatPeriodShort(stats.history[0].start, periodKind, locale) : ''}
          lastLabel={stats.history.length ? formatPeriodShort(stats.history[stats.history.length - 1].start, periodKind, locale) : ''}
        />
        <View style={styles.summary}>
          <Text style={[styles.summaryValue, { color: palette.text }]}>{stats.summary.sets}</Text>
          <Text style={[styles.summaryUnit, { color: palette.textMuted }]}>{stats.summary.sets === 1 ? strings.set : strings.sets}</Text>
        </View>
        {detail(stats.summary, threshold, strings) ? <Body>{detail(stats.summary, threshold, strings)}</Body> : null}
      </Card>

      <Card>
        {stats.items.length === 0 ? <Body>{strings.empty}</Body> : stats.items.map((item, index) => <View key={item.id} style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }]}>
          <View style={styles.rowHead}>
            <Text numberOfLines={1} style={[styles.rowName, { color: palette.text }]}>{itemName(item.id, item.name)}</Text>
            <Text style={[styles.rowValue, { color: palette.text }]}>{item.metrics.sets}</Text>
          </View>
          <View style={[styles.rowBar, { width: `${Math.max(3, (item.metrics.sets / maxSets) * 100)}%`, backgroundColor: palette.accentSoft }]} />
          {detail(item.metrics, threshold, strings) ? <Text style={[styles.rowDetail, { color: palette.textMuted }]}>{detail(item.metrics, threshold, strings)}</Text> : null}
        </View>)}
      </Card>

      <Stepper layout="row" label={strings.threshold} value={threshold} step={0.5} min={6} max={10} onChange={changeThreshold} />
    </>}
  </Screen>;
}

/** Only the non-zero parts, e.g. "48 rip · 2 ≥ RPE 8 · 120 kg·rep". Empty string when nothing to add. */
function detail(metrics: StatsMetrics, threshold: number, strings: Strings): string {
  return [
    metrics.reps > 0 ? `${metrics.reps} ${strings.reps}` : null,
    metrics.holdSeconds > 0 ? formatDuration(metrics.holdSeconds) : null,
    metrics.setsAtThreshold > 0 ? `${metrics.setsAtThreshold} ≥ RPE ${formatNumber(threshold)}` : null,
    metrics.loadRepsKg > 0 ? `${formatNumber(metrics.loadRepsKg)} kg·rep` : null,
    metrics.loadSecondsKg > 0 ? `${formatNumber(metrics.loadSecondsKg)} kg·s` : null,
  ].filter((part): part is string => part !== null).join(' · ');
}

const baseStyles = StyleSheet.create({
  controls: { gap: 8, marginBottom: 12 },
  quietToggle: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  quietItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quietText: { fontSize: 14 },
  loadingCard: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 10 },
  navigator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  periodLabel: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: 'Barlow_600SemiBold' },
  latest: { alignSelf: 'center', marginBottom: 8 },
  latestText: { fontSize: 13, fontFamily: 'Barlow_600SemiBold' },
  summary: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 14 },
  summaryValue: { fontSize: 28, fontFamily: 'Barlow_600SemiBold', fontVariant: ['tabular-nums'] },
  summaryUnit: { fontSize: 15 },
  row: { paddingVertical: 10, gap: 5 },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  rowName: { flex: 1, fontSize: 15, fontFamily: 'Barlow_600SemiBold' },
  rowValue: { fontSize: 16, fontFamily: 'Barlow_600SemiBold', fontVariant: ['tabular-nums'] },
  rowBar: { height: 4, borderRadius: 2 },
  rowDetail: { fontSize: 13 },
});
```

`IconButton` (`src/shared/components/ui.tsx:124`) has no `disabled` prop, hence the dimmed wrapper views around the arrows.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass (the i18n "literal keys" test still passes — only `t(\`movement.groups.${id}\`)` template keys are used).

- [ ] **Step 6: Commit**

```bash
git add app/stats.tsx "app/(tabs)/progress.tsx" src/features/analytics/repository.ts
git add -u app/training-totals.tsx src/features/analytics/trainingTotals.ts src/features/analytics/__tests__/trainingTotals.test.ts
git commit -m "Replace daily training totals with a statistics screen"
```

---

### Task 4: Recent micro-session exercises

**Files:**
- Modify: `src/features/session/microSession.ts`
- Test: `src/features/session/__tests__/microSession.test.ts`

**Interfaces:**
- Produces:
  - `pickRecent<T extends { id: string }>(ids: readonly string[], exercises: readonly T[], limit: number): T[]` — unique, in `ids` order, skipping ids with no exercise.
  - `listRecentMicroSessionExerciseIds(limit?: number): Promise<string[]>` — most recent first, unique.
  - `MICRO_SESSION_NAME = 'Grease the Groove'` (used by `logMicroSession` too).

- [ ] **Step 1: Failing test**

```ts
import { pickRecent } from '../microSession';

jest.mock('../../../db/client', () => ({ db: {}, initializeDatabase: jest.fn() }));

describe('pickRecent', () => {
  const exercises = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];

  it('keeps recency order, drops duplicates and unknown (archived) ids, and limits', () => {
    expect(pickRecent(['b', 'gone', 'b', 'a', 'c'], exercises, 2).map((item) => item.id)).toEqual(['b', 'a']);
  });
});
```

- [ ] **Step 2:** `npx jest src/features/session/__tests__/microSession.test.ts` → FAIL (`pickRecent` is not a function). If the mock path fails to resolve other imports (`./repository`), add `jest.mock('../repository', () => ({}))` and `jest.mock('../../exercises/repository', () => ({}))`.

- [ ] **Step 3: Implement** in `microSession.ts`:

```ts
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { exerciseEntries, settings, workouts } from '../../db/schema';

export const MICRO_SESSION_NAME = 'Grease the Groove';

/** Exercise ids from finished micro-sessions, most recent first, without duplicates. */
export async function listRecentMicroSessionExerciseIds(limit = 5): Promise<string[]> {
  await initializeDatabase();
  const rows = await db.select({ exerciseId: exerciseEntries.exerciseId })
    .from(exerciseEntries)
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(eq(workouts.name, MICRO_SESSION_NAME), isNotNull(workouts.endedAt)))
    .orderBy(desc(workouts.startedAt))
    .limit(100);
  return [...new Set(rows.map((row) => row.exerciseId))].slice(0, limit);
}

/** Resolves ids to exercises in the given order; ids without an exercise (archived) are skipped. */
export function pickRecent<T extends { id: string }>(ids: readonly string[], exercises: readonly T[], limit: number): T[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  return [...new Set(ids)].flatMap((id) => byId.get(id) ?? []).slice(0, limit);
}
```

and change `startWorkout('Grease the Groove')` to `startWorkout(MICRO_SESSION_NAME)`.

- [ ] **Step 4:** Run the test → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/features/session/microSession.ts src/features/session/__tests__/microSession.test.ts
git commit -m "List recently practised micro-session exercises"
```

---

### Task 5: Tidy the micro-session screen

**Files:**
- Modify: `app/micro-session.tsx` (whole render + state for `selected`)
- Modify: `src/shared/i18n/resources.ts` (en + it `micro` objects)

**Interfaces:**
- Consumes: Task 4 `listRecentMicroSessionExerciseIds`, `pickRecent`.

- [ ] **Step 1: Translations** — in `src/shared/i18n/resources.ts` replace
  `detail: "Choose a movement and a comfortable target. Each log creates a completed micro-session in your history.", back: "Back",` with `recent: "Recent", back: "Back",`
  and `detail: "Scegli un movimento e un obiettivo gestibile. Ogni registrazione crea una micro-sessione completata nello storico.", back: "Indietro",` with `recent: "Recenti", back: "Indietro",`.

- [ ] **Step 2: State** — keep the selected exercise as an object so a search that hides it does not empty the target card:

```tsx
const [selected, setSelected] = useState<Exercise | null>(null);
const [recent, setRecent] = useState<Exercise[]>([]);

const refresh = useCallback(async () => {
  const requestId = ++requestRef.current;
  const [items, all, recentIds, preferred] = await Promise.all([
    listMicroSessionExercises(query), listMicroSessionExercises(''), listRecentMicroSessionExerciseIds(5), getLastMicroSessionExercise(),
  ]);
  if (requestId !== requestRef.current) return;
  setExercises(items.slice(0, query.trim() ? 50 : 20));
  setRecent(pickRecent(recentIds, all, 5));
  setSelected((current) => current ?? all.find((item) => item.id === preferred) ?? all[0] ?? null);
}, [query]);
```

Delete `selectedId`/`setSelectedId` and the `useMemo` for `selected`; `selectExercise` calls `setSelected(exercise)`; after a successful `logMicroSession` call `void refresh()` so "Recent" updates. Drop the now-unused `useMemo` import.

- [ ] **Step 3: Render**

```tsx
const unitFor = (metric: string) => metric === 'time' || metric === 'time_load' ? t('micro.seconds') : metric === 'distance' ? t('micro.meters') : t('micro.reps');

return (
  <Screen>
    <PageHeading title={t('micro.title')} subtitle={t('micro.subtitle')} />
    <Card>
      {selected ? <>
        <Text numberOfLines={1} style={[styles.selectedName, { color: palette.text }]}>{selected.name}</Text>
        <Body>{t('micro.value')} · {unit}</Body>
        <View style={styles.targetRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('micro.decrease')} onPress={() => setValue(String(Math.max(increment, Number(value) - increment)))} style={[styles.adjust, { backgroundColor: palette.surfaceMuted }]}><Icon name="remove" size={18} color={palette.text} /></Pressable>
          <TextInput accessibilityLabel={`${t('micro.value')} ${unit}`} keyboardType="numbers-and-punctuation" value={value} onChangeText={setValue} style={[styles.value, { backgroundColor: palette.surfaceMuted, borderColor: palette.border, color: palette.text }]} />
          <Pressable accessibilityRole="button" accessibilityLabel={t('micro.increase')} onPress={() => setValue(String(Number(value || 0) + increment))} style={[styles.adjust, { backgroundColor: palette.surfaceMuted }]}><Icon name="add" size={18} color={palette.text} /></Pressable>
        </View>
        <ActionButton label={working ? t('micro.working') : t('micro.save')} onPress={() => void log()} />
        {message === 'done' ? <Body style={{ color: palette.accentStrong }}>{t('micro.done')}</Body> : message === 'error' ? <Body style={{ color: palette.warning }}>{t('micro.error')}</Body> : null}
      </> : <Body>{t('micro.empty')}</Body>}
    </Card>
    {recent.length > 0 && <View style={styles.section}>
      <Label>{t('micro.recent')}</Label>
      <View style={styles.chips}>{recent.map((exercise) => <Chip key={exercise.id} label={exercise.name} selected={exercise.id === selected?.id} onPress={() => selectExercise(exercise)} />)}</View>
    </View>}
    <View style={styles.section}>
      <Label>{t('micro.choose')}</Label>
      <TextInput accessibilityLabel={t('micro.search')} placeholder={t('micro.search')} placeholderTextColor={palette.textMuted} value={query} onChangeText={setQuery} style={[styles.search, { backgroundColor: palette.surfaceMuted, color: palette.text, borderColor: palette.border }]} />
      {exercises.length === 0 ? <Body>{t('micro.empty')}</Body> : exercises.map((exercise, index) => {
        const active = exercise.id === selected?.id;
        return <Pressable key={exercise.id} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => selectExercise(exercise)} style={[styles.item, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }]}>
          <Text numberOfLines={1} style={[styles.itemName, { color: active ? palette.accentStrong : palette.text }]}>{exercise.name}</Text>
          <Text style={[styles.itemUnit, { color: palette.textMuted }]}>{unitFor(exercise.metric)}</Text>
          <View style={styles.check}>{active ? <Icon name="checkmark" size={18} color={palette.accentStrong} /> : null}</View>
        </Pressable>;
      })}
    </View>
    <ActionButton label={t('micro.back')} secondary onPress={() => goBack()} />
  </Screen>
);
```

Styles (replace `choice`, `choiceText`; shrink target controls):

```ts
const baseStyles = StyleSheet.create({
  selectedName: { fontSize: 18, fontFamily: 'Barlow_600SemiBold' },
  targetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginVertical: 10 },
  adjust: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  value: { width: 96, height: 46, borderWidth: 1, borderRadius: 14, textAlign: 'center', fontSize: 20, fontWeight: '700' },
  section: { gap: 8, marginVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  search: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  item: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemName: { flex: 1, fontSize: 15 },
  itemUnit: { fontSize: 13 },
  check: { width: 18 },
});
```

Imports: add `Chip` from ui, `listRecentMicroSessionExerciseIds`, `pickRecent`; remove `Heading` and `useMemo` if unused.

- [ ] **Step 4: Verify** — `npm run typecheck && npm run lint && npm test` → pass (i18n parity and literal-key tests included).
- [ ] **Step 5: Commit**

```bash
git add app/micro-session.tsx src/shared/i18n/resources.ts
git commit -m "Tidy the micro-session logger with recent exercises and a compact list"
```

---

### Task 6: Verify on the emulator

- [ ] **Step 1:** `emulator -avd Medium_Phone_API_36.1 -no-snapshot-save &` then `adb wait-for-device`; `npx expo run:android` (debug build, Metro).
- [ ] **Step 2: Create data** — open `adb shell am start -a android.intent.action.VIEW -d "trackitbetter://micro-session" com.trackitbetter.app`; log 3 micro-sessions on two different exercises (one reps, one timed). Screenshot: `adb exec-out screencap -p > $SCRATCH/micro.png`. Check "Recent" chips show them.
- [ ] **Step 3: Keyboard** — tap the search field and the target value field; screenshot each with the keyboard open. The focused field and the "Log micro-session" button area must not be hidden (for the value field: field fully visible).
- [ ] **Step 4: Statistics** — `adb shell am start -a android.intent.action.VIEW -d "trackitbetter://stats" com.trackitbetter.app`. Screenshot Pattern/Groups, Pattern/Tags, Exercise, and each of Session/Day/Week/Month. Tap a chart column and the ‹ › arrows; confirm labels, disabled › at the latest, "Oggi/Today" appears only when not at the latest.
- [ ] **Step 5: Dark mode** — `adb shell cmd uimode night yes`, repeat the stats screenshot; `accentSoft` bars must be visibly distinct from the card surface. If not, use `palette.accent` at `opacity: 0.35` for non-selected columns and row bars, and re-check both themes.
- [ ] **Step 6:** Fix anything that looks crowded, overlapping or truncated; re-run `npm test`; commit fixes.
