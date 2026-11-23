import {
  DEFAULT_EXERCISE_RULE,
  evaluateExerciseRule,
  isCustomRule,
  PROGRESSION_METHODS,
  sanitizeExerciseRule,
} from '../progressionMethods';

describe('PROGRESSION_METHODS catalog', () => {
  it('includes all 21 methods across intra (9), inter (8) and complex (4)', () => {
    expect(PROGRESSION_METHODS).toHaveLength(21);
    expect(PROGRESSION_METHODS.filter((m) => m.family === 'intra')).toHaveLength(9);
    expect(PROGRESSION_METHODS.filter((m) => m.family === 'inter')).toHaveLength(8);
    expect(PROGRESSION_METHODS.filter((m) => m.family === 'complex')).toHaveLength(4);
  });

  it('sanitizes rules and clamps out-of-range parameters', () => {
    expect(sanitizeExerciseRule({ method: 'bogus' })).toBeNull();
    expect(sanitizeExerciseRule({ method: 'linear_load', loadStepKg: 999, minForm: 4, maxRpe: 8.5, note: '  keep elbows in  ' }))
      .toEqual({ method: 'linear_load', loadStepKg: 25, minForm: 4, maxRpe: 8.5, note: 'keep elbows in' });
    expect(isCustomRule(DEFAULT_EXERCISE_RULE)).toBe(false);
    expect(isCustomRule({ method: 'auto', minForm: 4 })).toBe(true);
    expect(isCustomRule({ method: 'density' })).toBe(true);
  });
});

describe('evaluateExerciseRule', () => {
  const reps5x3 = [{ reps: 5, rpe: 8, formRating: 4 }, { reps: 5, rpe: 8, formRating: 4 }, { reps: 5, rpe: 8, formRating: 4 }];

  it('enforces custom minForm and maxRpe gates before suggesting any progression', () => {
    expect(evaluateExerciseRule({ method: 'linear_reps', minForm: 4.5 }, { metric: 'reps', sets: reps5x3 }))
      .toEqual({ kind: 'consolidate_form', avgForm: 4 });
    expect(evaluateExerciseRule({ method: 'linear_reps', maxRpe: 7.5 }, { metric: 'reps', sets: reps5x3 }))
      .toEqual({ kind: 'consolidate_rpe', avgRpe: 8 });
  });

  it('handles all simple intra-exercise methods', () => {
    expect(evaluateExerciseRule({ method: 'linear_load', loadStepKg: 2.5 }, { metric: 'reps_load', sets: [{ reps: 5, addedLoadKg: 10 }] }))
      .toEqual({ kind: 'add_load', nextLoadKg: 12.5, stepKg: 2.5, bridge: false });
    expect(evaluateExerciseRule({ method: 'linear_reps', repStep: 2 }, { metric: 'reps', sets: reps5x3 }))
      .toEqual({ kind: 'linear_bump', scheme: [7, 7, 7], unit: 'reps' });
    expect(evaluateExerciseRule({ method: 'rep_addition', repStep: 1 }, { metric: 'reps', sets: reps5x3 }))
      .toEqual({ kind: 'rep_addition', scheme: [6, 5, 5], unit: 'reps' });
    expect(evaluateExerciseRule({ method: 'rep_addition', repStep: 1 }, { metric: 'reps', sets: [{ reps: 6 }, { reps: 5 }, { reps: 5 }] }))
      .toEqual({ kind: 'rep_addition', scheme: [6, 6, 5], unit: 'reps' });
    // Last set to failure: 5-5-7 (>= +2) -> bump to 6-6-6; 5-5-6 -> aim for 7
    expect(evaluateExerciseRule({ method: 'last_set_failure', lastSetMargin: 2 }, { metric: 'reps', sets: [{ reps: 5 }, { reps: 5 }, { reps: 7 }] }))
      .toEqual({ kind: 'last_set_ready', scheme: [6, 6, 6], unit: 'reps', margin: 2 });
    expect(evaluateExerciseRule({ method: 'last_set_failure', lastSetMargin: 2 }, { metric: 'reps', sets: [{ reps: 5 }, { reps: 5 }, { reps: 6 }] }))
      .toEqual({ kind: 'last_set_aim', targetLast: 7, unit: 'reps', margin: 2 });
    // Additional set
    expect(evaluateExerciseRule({ method: 'additional_set', maxSets: 5 }, { metric: 'reps', sets: reps5x3 }))
      .toEqual({ kind: 'add_set', nextSets: 4, amount: 5, unit: 'reps' });
    expect(evaluateExerciseRule({ method: 'additional_set', maxSets: 3 }, { metric: 'reps', sets: reps5x3 }))
      .toEqual({ kind: 'sets_at_cap', maxSets: 3 });
    // Rest-pause
    expect(evaluateExerciseRule({ method: 'rest_pause', restPauseSec: 20 }, { metric: 'reps', sets: reps5x3 }))
      .toEqual({ kind: 'rest_pause', pauseSec: 20 });
    // Density
    expect(evaluateExerciseRule({ method: 'density', restStepSec: 15, minRestSec: 60 }, { metric: 'reps', sets: [{ reps: 5, restSec: 120 }], defaultRestSec: 120 }))
      .toEqual({ kind: 'reduce_rest', nextRestSec: 105, stepSec: 15 });
    expect(evaluateExerciseRule({ method: 'density', restStepSec: 15, minRestSec: 60 }, { metric: 'reps', sets: [{ reps: 5, restSec: 60 }], defaultRestSec: 60 }))
      .toEqual({ kind: 'rest_at_min', minRestSec: 60 });
    // Tempo & frequency
    expect(evaluateExerciseRule({ method: 'tempo' }, { metric: 'reps', sets: [{ reps: 5, tempo: '10X0' }] }))
      .toEqual({ kind: 'slow_tempo', nextTempo: '20X0' });
    expect(evaluateExerciseRule({ method: 'frequency' }, { metric: 'reps', sets: reps5x3 }))
      .toEqual({ kind: 'method_cue', method: 'frequency', note: null });
  });

  it('handles all simple inter-exercise and complex periodization methods', () => {
    expect(evaluateExerciseRule({ method: 'weight_bridge', loadStepKg: 5 }, { metric: 'reps_load', sets: [{ reps: 5, addedLoadKg: 5 }] }))
      .toEqual({ kind: 'add_load', nextLoadKg: 10, stepKg: 5, bridge: true });
    expect(evaluateExerciseRule({ method: 'assistance' }, { metric: 'reps', sets: reps5x3 }))
      .toEqual({ kind: 'less_assistance' });
    expect(evaluateExerciseRule({ method: 'eccentrics', eccentricSec: 8 }, { metric: 'reps', sets: reps5x3 }))
      .toEqual({ kind: 'eccentric_cluster', seconds: 8 });
    expect(evaluateExerciseRule({ method: 'sets_and_density', maxSets: 5, restStepSec: 15, minRestSec: 60 }, { metric: 'reps', sets: [{ reps: 5, restSec: 120 }, { reps: 5, restSec: 120 }] }))
      .toEqual({ kind: 'reduce_rest', nextRestSec: 105, stepSec: 15, alsoAddSet: 3 });
    expect(evaluateExerciseRule({ method: 'hybrid_sets', hybridReps: 2 }, { metric: 'reps', sets: reps5x3, nextExerciseName: 'Ring Dip' }))
      .toEqual({ kind: 'hybrid_bridge', reps: 2, simple: false, nextExerciseName: 'Ring Dip' });
    expect(evaluateExerciseRule({ method: 'simple_hybrid', hybridReps: 1 }, { metric: 'reps', sets: reps5x3, nextExerciseName: 'Muscle-up' }))
      .toEqual({ kind: 'hybrid_bridge', reps: 1, simple: true, nextExerciseName: 'Muscle-up' });
    for (const method of ['momentum_rom', 'variation', 'accumulation_intensification', 'light_heavy', 'dup', 'concurrent_conjugate'] as const) {
      expect(evaluateExerciseRule({ method, note: 'custom cue' }, { metric: 'reps', sets: reps5x3 }))
        .toEqual({ kind: 'method_cue', method, note: 'custom cue' });
    }
  });
});
