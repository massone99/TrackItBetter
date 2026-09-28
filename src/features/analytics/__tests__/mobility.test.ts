import { buildExerciseCycle, buildExerciseWeek, buildMobilityCycles, buildMobilityWeek, isMobilityTimedSet, mobilitySecondsForWorkout } from '../mobility';
import type { CompletedSetRow } from '../summary';

function row(overrides: Partial<CompletedSetRow>): CompletedSetRow {
  return {
    workoutId: 'w1',
    workoutStartedAt: new Date('2026-09-25T10:00:00Z'),
    bodyweightKg: 70,
    exerciseId: 'pike-stretch',
    exerciseName: 'Pike stretch',
    category: 'mobility',
    movementPattern: 'hamstring-flexibility',
    metric: 'time',
    leverageFactor: null,
    setId: Math.random().toString(36),
    reps: null,
    durationSec: 60,
    distanceM: null,
    addedLoadKg: 0,
    completedAt: new Date('2026-09-25T10:05:00Z'),
    ...overrides,
  };
}

const now = new Date('2026-09-28T12:00:00Z');
const wristRocks = { exerciseId: 'wrist-rocks', metric: 'reps', reps: 15, durationSec: null };

describe('isMobilityTimedSet', () => {
  it('counts only mobility holds with a duration', () => {
    expect(isMobilityTimedSet(row({}))).toBe(true);
    expect(isMobilityTimedSet(row({ metric: 'time_load' }))).toBe(true);
    expect(isMobilityTimedSet(row(wristRocks))).toBe(false);
    expect(isMobilityTimedSet(row({ category: 'core' }))).toBe(false);
    expect(isMobilityTimedSet(row({ durationSec: 0 }))).toBe(false);
  });
});

describe('mobilitySecondsForWorkout', () => {
  it('sums the holds of that workout only', () => {
    const rows = [row({ durationSec: 45 }), row({ durationSec: 30 }), row(wristRocks), row({ workoutId: 'w2', durationSec: 90 }), row({ category: 'core', durationSec: 60 })];
    expect(mobilitySecondsForWorkout(rows, 'w1')).toBe(75);
    expect(mobilitySecondsForWorkout(rows, 'missing')).toBe(0);
  });
});

describe('buildMobilityWeek', () => {
  it('sums the last 7 days and counts workouts with any mobility set', () => {
    const rows = [
      row({ durationSec: 60 }),
      row({ workoutId: 'w2', workoutStartedAt: new Date('2026-09-27T08:00:00Z'), ...wristRocks }),
      row({ workoutId: 'old', workoutStartedAt: new Date('2026-09-20T08:00:00Z'), durationSec: 600 }),
      row({ workoutId: 'w3', category: 'push', metric: 'reps', durationSec: null }),
    ];
    expect(buildMobilityWeek(rows, now)).toEqual({ seconds: 60, sessions: 2 });
  });

  it('is empty without data', () => {
    expect(buildMobilityWeek([], now)).toEqual({ seconds: 0, sessions: 0 });
  });
});

describe('buildExerciseWeek', () => {
  it('counts sets and distinct workouts for a rep-based drill, without time', () => {
    const rows = [row(wristRocks), row(wristRocks), row({ workoutId: 'w2', ...wristRocks }), row({})];
    expect(buildExerciseWeek(rows, 'wrist-rocks', 'reps', now)).toEqual({ sets: 3, sessions: 2, seconds: null });
  });

  it('adds hold time for a timed exercise and ignores older workouts', () => {
    const rows = [row({ durationSec: 40 }), row({ durationSec: 50 }), row({ workoutId: 'old', workoutStartedAt: new Date('2026-09-01T08:00:00Z') })];
    expect(buildExerciseWeek(rows, 'pike-stretch', 'time', now)).toEqual({ sets: 2, sessions: 1, seconds: 90 });
  });
});

describe('per-exercise weeks', () => {
  // Local dates keep these tests independent of the machine's time zone.
  const at = (day: number, hour = 10) => new Date(2026, 8, day, hour);
  const today = at(28, 12);
  const pike = (day: number, durationSec = 60, workoutId = `w${day}`) => row({ workoutId, workoutStartedAt: at(day), durationSec });
  const split = (day: number, durationSec = 45) => row({ workoutId: `s${day}`, workoutStartedAt: at(day), exerciseId: 'front-split', exerciseName: 'Front split', durationSec });

  it('starts each exercise\'s week on the first day it is trained', () => {
    const rows = [pike(28), split(26), split(27, 30)];
    const pikeWeek = buildExerciseCycle(rows, 'pike-stretch', today).current!;
    const splitWeek = buildExerciseCycle(rows, 'front-split', today).current!;
    expect(pikeWeek).toMatchObject({ start: new Date(2026, 8, 28), day: 1, seconds: 60, sets: 1, sessions: 1 });
    expect(splitWeek).toMatchObject({ start: new Date(2026, 8, 26), end: new Date(2026, 9, 3), day: 3, seconds: 75, sessions: 2 });
  });

  it('opens a new week when the exercise is trained after the old one ended', () => {
    const rows = [pike(15, 100), pike(20, 50), pike(22, 30), pike(27, 40)];
    const { current, previous } = buildExerciseCycle(rows, 'pike-stretch', today);
    // 15–21 is one week; 22 starts the next one, which is still running on the 28th.
    expect(previous).toMatchObject({ start: new Date(2026, 8, 15), seconds: 150 });
    expect(current).toMatchObject({ start: new Date(2026, 8, 22), day: 7, seconds: 70 });
  });

  it('has no current week once seven days have passed', () => {
    const { current, previous } = buildExerciseCycle([pike(10)], 'pike-stretch', today);
    expect(current).toBeNull();
    expect(previous).toMatchObject({ seconds: 60 });
  });

  it('counts sets without time for rep-based drills', () => {
    const rows = [row({ ...wristRocks, workoutStartedAt: at(27) }), row({ ...wristRocks, workoutStartedAt: at(27) })];
    expect(buildExerciseCycle(rows, 'wrist-rocks', today).current).toMatchObject({ sets: 2, sessions: 1, seconds: null });
  });

  it('lists the mobility weeks in progress, newest first', () => {
    const rows = [pike(28), split(26), pike(1), row({ exerciseId: 'push-up', category: 'push', workoutStartedAt: at(27) })];
    expect(buildMobilityCycles(rows, today).map((cycle) => cycle.exerciseId)).toEqual(['pike-stretch', 'front-split']);
  });
});
