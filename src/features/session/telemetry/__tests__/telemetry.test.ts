import type { ExerciseHistorySession } from '../../../analytics/repository';
import { deriveExerciseTelemetry, type TelemetrySet } from '../derive';
import { telemetrySummary, telemetryTiles } from '../ExerciseTelemetryDock';
import { activeSetOf, comparableHistory } from '../adapter';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));

const set = (id: string, values: Partial<TelemetrySet> = {}): TelemetrySet => ({
  id, kind: 'working', completedAt: new Date(), reps: 8, durationSec: null, distanceM: null, addedLoadKg: 0, assistKg: null, bands: [], rpe: 8, formRating: 4, romRating: 4, ...values,
});
const t = (key: string, options?: Record<string, unknown>) => `${key}${options ? JSON.stringify(options) : ''}`;
const session = (workoutId: string, apparatusId: string | null, sets: ExerciseHistorySession['sets']): ExerciseHistorySession =>
  ({ entryId: workoutId, workoutId, workoutName: workoutId, startedAt: new Date(2026, 9, 1), notes: null, apparatusId, sets });
const historySet = (id: string, reps: number): ExerciseHistorySession['sets'][number] => ({ id, kind: 'working', reps, durationSec: null, distanceM: null, addedLoadKg: 0, rpe: 7 });

describe('comparableHistory', () => {
  const sessions = [session('rings', 'rings', [historySet('a', 10)]), session('bar', 'bar', [historySet('b', 6)])];
  it('keeps only the same apparatus when it changes the difficulty', () => {
    expect(comparableHistory(sessions, { apparatusAffectsDifficulty: true, apparatusId: 'bar' }).map((s) => s.workoutId)).toEqual(['bar']);
  });
  it('keeps every session when the apparatus does not matter', () => {
    expect(comparableHistory(sessions, { apparatusAffectsDifficulty: false, apparatusId: 'bar' })).toHaveLength(2);
  });
});

describe('activeSetOf', () => {
  it('is the first open working set, else the last one done', () => {
    const sets = [set('1'), set('2', { completedAt: null }), set('w', { kind: 'warmup', completedAt: null })];
    expect(activeSetOf({ sets: sets as never })).toBe('2');
    expect(activeSetOf({ sets: [set('1'), set('2')] as never })).toBe('2');
    expect(activeSetOf({ sets: [] })).toBeNull();
  });
});

describe('telemetry tiles', () => {
  const view = (current: TelemetrySet[], history: TelemetrySet[][], usesBands = false) => ({
    telemetry: deriveExerciseTelemetry({ metric: 'reps', currentSets: current, activeSetId: current.at(-1)?.id ?? null, history: history.map((sets, i) => ({ workoutId: `h${i}`, sets })), usesBands }),
    sessions: history.length, usesBands,
  });
  it('shows a dash, never zero, for ratings that were not given', () => {
    const tiles = telemetryTiles(view([set('1', { rpe: null })], [[set('h')]]), t);
    expect(tiles.find((tile) => tile.id === 'rpe')?.value).toBe('—');
  });
  it('hides the assistance tile without bands and keeps unknown help unknown', () => {
    expect(telemetryTiles(view([set('1')], [[set('h')]]), t).some((tile) => tile.id === 'assistance')).toBe(false);
    const banded = set('b', { bands: [{ bandId: 'blue', tension: 2 }], assistKg: null });
    expect(telemetryTiles(view([banded], [[set('h')]], true), t).find((tile) => tile.id === 'assistance')?.value).toBe('?');
  });
  it('says first session when there is no history', () => {
    expect(telemetrySummary(view([set('1', { completedAt: null })], []), t)).toContain('telemetry.firstSession');
  });
});
