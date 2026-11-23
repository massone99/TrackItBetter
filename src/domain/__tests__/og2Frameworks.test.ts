import {
  adaptationZone,
  analyzeProgramBalance,
  classifyWeeklyZones,
  evaluateMesocycleLoad,
  isometricPrilepin,
} from '../og2Frameworks';
import type { MovementGroupId } from '../../features/exercises/movementCatalog';

describe('adaptationZone (OG2 Repetition & Isometric Continuum)', () => {
  it('maps reps across strength, hypertrophy and endurance with 1 rep ≈ 2 s equivalence', () => {
    expect(adaptationZone('reps', 3)).toMatchObject({ zone: 'max_strength', bucket: 'strength', restMinSec: 180, equivalent: { mode: 'hold', value: 6 } });
    expect(adaptationZone('reps', 5)).toMatchObject({ zone: 'strength', bucket: 'strength', equivalent: { mode: 'hold', value: 10 } });
    expect(adaptationZone('reps', 8)).toMatchObject({ zone: 'hypertrophy', bucket: 'hypertrophy', equivalent: { mode: 'hold', value: 16 } });
    expect(adaptationZone('reps', 14)).toMatchObject({ zone: 'upper_hypertrophy', bucket: 'hypertrophy', equivalent: { mode: 'hold', value: 28 } });
    expect(adaptationZone('reps', 20)).toMatchObject({ zone: 'endurance', bucket: 'endurance', equivalent: null });
  });

  it('maps holds onto the same unified zones', () => {
    expect(adaptationZone('hold', 6)).toMatchObject({ zone: 'max_strength', bucket: 'strength', equivalent: { mode: 'reps', value: 3 } });
    expect(adaptationZone('hold', 10)).toMatchObject({ zone: 'strength', bucket: 'strength', equivalent: { mode: 'reps', value: 5 } });
    expect(adaptationZone('hold', 20)).toMatchObject({ zone: 'hypertrophy', bucket: 'hypertrophy', equivalent: { mode: 'reps', value: 10 } });
    expect(adaptationZone('hold', 40)).toMatchObject({ zone: 'endurance', bucket: 'endurance', equivalent: null });
    expect(adaptationZone('reps', 0)).toBeNull();
  });
});

describe('isometricPrilepin (OG2 Ch. 9)', () => {
  it('computes 60–75% Prilepin sweet spot and 50% 60-second method from max hold', () => {
    const p10 = isometricPrilepin(10)!;
    expect(p10.prilepin.holdSec).toBe(7);
    expect(p10.prilepin.sweetSpotSets).toBe(5);
    expect(p10.prilepin.totalSec).toBe(35);
    expect(p10.sixtySecond).toEqual({ holdSec: 5, sets: 12, totalSec: 60 });
    expect(p10.enduranceRange).toBe(false);

    const p40 = isometricPrilepin(40)!;
    expect(p40.enduranceRange).toBe(true);
    expect(p40.sixtySecond).toEqual({ holdSec: 20, sets: 3, totalSec: 60 });
    expect(isometricPrilepin(1)).toBeNull();
  });
});

describe('classifyWeeklyZones', () => {
  it('counts non-mobility rep and hold sets by stimulus bucket', () => {
    const split = classifyWeeklyZones([
      { metric: 'reps', reps: 4, durationSec: null, category: 'pull' },
      { metric: 'time', reps: null, durationSec: 8, category: 'skill' },
      { metric: 'reps_load', reps: 10, durationSec: null, category: 'push' },
      { metric: 'time', reps: null, durationSec: 45, category: 'core' },
      { metric: 'time', reps: null, durationSec: 60, category: 'mobility' },
    ]);
    expect(split).toEqual({ strength: 2, hypertrophy: 1, endurance: 1, total: 4 });
  });
});

describe('evaluateMesocycleLoad (Fitness–Fatigue & Deload window)', () => {
  const now = new Date('2026-11-23T12:00:00');
  const weeksAgo = (w: number) => new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
  const makeWeekSets = (w: number, count: number) =>
    Array.from({ length: count }, () => ({ workoutId: `w${w}`, workoutStartedAt: weeksAgo(w), completedAt: weeksAgo(w) }));

  it('returns null with fewer than 3 active weeks so new users see no noise', () => {
    const sets = [...makeWeekSets(1, 20), ...makeWeekSets(2, 20)];
    expect(evaluateMesocycleLoad(sets, [], now)).toBeNull();
  });

  it('detects building vs deload_window after 5 consecutive high weeks', () => {
    const building = [...makeWeekSets(1, 24), ...makeWeekSets(2, 24), ...makeWeekSets(3, 24)];
    expect(evaluateMesocycleLoad(building, [], now)).toMatchObject({ state: 'building', consecutiveHardWeeks: 3 });

    const deloadDue = [...makeWeekSets(1, 24), ...makeWeekSets(2, 24), ...makeWeekSets(3, 24), ...makeWeekSets(4, 24), ...makeWeekSets(5, 24)];
    expect(evaluateMesocycleLoad(deloadDue, [], now)).toMatchObject({ state: 'deload_window', consecutiveHardWeeks: 5 });
  });

  it('triggers deload_window at 4 weeks when check-ins show elevated fatigue', () => {
    const sets = [...makeWeekSets(1, 24), ...makeWeekSets(2, 24), ...makeWeekSets(3, 24), ...makeWeekSets(4, 24)];
    const workouts = [
      { id: 'w1', startedAt: weeksAgo(1), sessionRpe: 9, sleep: 2, energy: 2, soreness: 4 },
      { id: 'w0', startedAt: weeksAgo(0), sessionRpe: 9, sleep: 2, energy: 2, soreness: 4 },
    ];
    expect(evaluateMesocycleLoad(sets, workouts, now)).toMatchObject({ state: 'deload_window', consecutiveHardWeeks: 4, elevatedFatigue: true });
  });

  it('detects a deloaded supercompensation week right after 3+ hard weeks', () => {
    const sets = [...makeWeekSets(1, 10), ...makeWeekSets(2, 24), ...makeWeekSets(3, 24), ...makeWeekSets(4, 24)];
    expect(evaluateMesocycleLoad(sets, [], now)).toMatchObject({ state: 'deloaded', consecutiveHardWeeks: 0, latestWeekSets: 10 });
  });
});

describe('analyzeProgramBalance (OG2 Ch. 4 Structural Balance)', () => {
  const groups: Record<string, MovementGroupId> = {
    pushup: 'horizontal-push',
    row: 'horizontal-pull',
    dip: 'vertical-push',
    pullup: 'vertical-pull',
    squat: 'squat',
  };
  const ex = (exerciseId: string, sets: number, block?: 'warmup' | 'main' | 'mobility' | null) => ({
    id: exerciseId, exerciseId, sets, target: 8, block,
  });

  it('reports clean 1:1 H/V balance with no notices', () => {
    const balanced = analyzeProgramBalance(
      [{ exercises: [ex('pushup', 3), ex('row', 3), ex('dip', 3), ex('pullup', 3), ex('pushup', 5, 'warmup')] }],
      (id) => groups[id],
    );
    expect(balanced).toEqual({
      push: 6, pull: 6, horizontalPush: 3, horizontalPull: 3, verticalPush: 3, verticalPull: 3, squat: 0, hinge: 0, notices: [],
    });
  });

  it('flags push-heavy imbalance and missing horizontal pull without blocking', () => {
    const unbalanced = analyzeProgramBalance(
      [{ exercises: [ex('pushup', 4), ex('dip', 4), ex('pullup', 3)] }],
      (id) => groups[id],
    );
    expect(unbalanced.notices).toEqual(['pushHeavy', 'missingHorizontalPull']);
  });
});
