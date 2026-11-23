import {
  calculateEffectiveLoad,
  calculateVolume,
  detectPersonalRecords,
  estimateBodyweightInclusiveOneRepMax,
  estimateOneRepMax,
  evaluateProgression,
  formatNextStepScheme,
  kilogramsToPounds,
  meetsProgressionTarget,
  poundsToKilograms,
  suggestNextStep,
} from '..';

describe('unit conversions', () => {
  it('converts kilograms and pounds in both directions', () => {
    expect(kilogramsToPounds(1)).toBeCloseTo(2.20462, 4);
    expect(poundsToKilograms(2.2046226218)).toBeCloseTo(1, 8);
  });
});

describe('effective load', () => {
  it('combines bodyweight, leverage, and added or assisted load', () => {
    expect(calculateEffectiveLoad(80, 0.75, 10)).toBe(70);
    expect(calculateEffectiveLoad(80, 0.75, -5)).toBe(55);
  });
});

describe('one-rep max estimates', () => {
  it('supports Epley and Brzycki estimates', () => {
    expect(estimateOneRepMax(90, 10)).toBe(120);
    expect(estimateOneRepMax(90, 10, 'brzycki')).toBeCloseTo((90 * 36) / 27);
    expect(estimateBodyweightInclusiveOneRepMax(80, 1, 20, 10)).toBeCloseTo(400 / 3);
  });
});

describe('personal record detection', () => {
  it('returns only the best candidate that beats the previous record', () => {
    const previous = [{ exerciseId: 'pull-up', type: 'e1rm' as const, value: 80 }];
    const candidates = [
      { exerciseId: 'pull-up', type: 'e1rm' as const, value: 81, setId: 'set-1' },
      { exerciseId: 'pull-up', type: 'e1rm' as const, value: 84, setId: 'set-2' },
      { exerciseId: 'pull-up', type: 'max_reps' as const, value: 12 },
      { exerciseId: 'pull-up', type: 'max_reps' as const, value: 12 },
    ];

    expect(detectPersonalRecords(candidates, previous)).toEqual([
      { exerciseId: 'pull-up', type: 'e1rm', value: 84, setId: 'set-2' },
      { exerciseId: 'pull-up', type: 'max_reps', value: 12 },
    ]);
  });

  it('does not count a tie as a new record', () => {
    const record = { exerciseId: 'dip', type: 'max_load' as const, value: 20 };
    expect(detectPersonalRecords([record], [record])).toEqual([]);
  });
});

describe('progression rules', () => {
  const target = { sets: 3, reps: 8 };
  const action = { kind: 'increase_reps' as const, amount: 1 };
  const successfulSession = {
    completed: true,
    sets: [{ reps: 8 }, { reps: 10 }, { reps: 8 }],
  };

  it('requires the target across the requested number of consecutive sessions', () => {
    expect(meetsProgressionTarget(successfulSession, target)).toBe(true);
    expect(evaluateProgression(target, { successfulSessionsToProgress: 2, action }, [
      successfulSession,
      successfulSession,
    ])).toEqual({ eligible: true, consecutiveSuccessfulSessions: 2, action });
    expect(evaluateProgression(target, { successfulSessionsToProgress: 2, action }, [
      successfulSession,
      { ...successfulSession, sets: [{ reps: 8 }, { reps: 7 }, { reps: 10 }] },
      successfulSession,
    ])).toEqual({ eligible: false, consecutiveSuccessfulSessions: 1, action: null });
  });

  it('enforces optional minimum form and maximum RPE gates on every counted set', () => {
    const gated = { sets: 3, reps: 8, minForm: 4, maxRpe: 8.5 };
    const clean = {
      completed: true,
      sets: [
        { reps: 8, formRating: 4, rpe: 8 },
        { reps: 8, formRating: 4.5, rpe: 8.5 },
        { reps: 8, formRating: 4, rpe: 8.5 },
      ],
    };
    const sloppy = { ...clean, sets: [{ reps: 8, formRating: 3.5, rpe: 8 }, clean.sets[1], clean.sets[2]] };
    const grinding = { ...clean, sets: [clean.sets[0], clean.sets[1], { reps: 8, formRating: 4, rpe: 9 }] };
    const unrated = { ...clean, sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }] };
    expect(meetsProgressionTarget(clean, gated)).toBe(true);
    expect(meetsProgressionTarget(sloppy, gated)).toBe(false);
    expect(meetsProgressionTarget(grinding, gated)).toBe(false);
    expect(meetsProgressionTarget(unrated, gated)).toBe(false);
  });

  it('suggests OG2 next-step progressions (consolidate, hybrid, assistance, rep addition, linear bump)', () => {
    expect(suggestNextStep({ metric: 'reps', sets: [{ reps: 5, formRating: 3 }, { reps: 5, formRating: 3 }] }))
      .toEqual({ kind: 'consolidate_form', avgForm: 3 });
    expect(suggestNextStep({ metric: 'reps', sets: [{ reps: 5, rpe: 9.5 }, { reps: 5, rpe: 10 }] }))
      .toEqual({ kind: 'consolidate_rpe', avgRpe: 9.8 });
    expect(suggestNextStep({ metric: 'reps', sets: [{ reps: 8, formRating: 4, rpe: 8 }], eligible: true, nextExerciseName: 'Ring Dip' }))
      .toEqual({ kind: 'advance_hybrid', nextExerciseName: 'Ring Dip' });
    expect(suggestNextStep({ metric: 'reps', sets: [{ reps: 8, rpe: 7.5, assisted: true }, { reps: 8, rpe: 8, assisted: true }] }))
      .toEqual({ kind: 'less_assistance' });
    // Even sets at moderate/hard RPE -> Repetition Addition (5-5-5 -> 6-5-5)
    expect(suggestNextStep({ metric: 'reps', sets: [{ reps: 5, rpe: 8.5 }, { reps: 5, rpe: 8.5 }, { reps: 5, rpe: 8.5 }] }))
      .toEqual({ kind: 'rep_addition', scheme: [6, 5, 5], unit: 'reps' });
    // Uneven sets -> bring next lagging set up (6-5-5 -> 6-6-5)
    expect(suggestNextStep({ metric: 'reps', sets: [{ reps: 6, rpe: 8 }, { reps: 5, rpe: 8 }, { reps: 5, rpe: 8 }] }))
      .toEqual({ kind: 'rep_addition', scheme: [6, 6, 5], unit: 'reps' });
    // Easy sets (RPE <= 7.5) -> linear bump across all sets
    expect(suggestNextStep({ metric: 'reps', sets: [{ reps: 5, rpe: 7 }, { reps: 5, rpe: 7.5 }, { reps: 5, rpe: 7.5 }] }))
      .toEqual({ kind: 'linear_bump', scheme: [6, 6, 6], unit: 'reps' });
    // Holds add +2s
    expect(suggestNextStep({ metric: 'time', sets: [{ durationSec: 10, rpe: 8.5 }, { durationSec: 10, rpe: 8.5 }] }))
      .toEqual({ kind: 'rep_addition', scheme: [12, 10], unit: 'seconds' });
    expect(formatNextStepScheme([6, 5, 5], 'reps')).toBe('6-5-5');
    expect(formatNextStepScheme([12, 10], 'seconds')).toBe('12-10 s');
  });
});

describe('volume math', () => {
  it('keeps repetition and hold volume in separate units', () => {
    expect(calculateVolume([
      { effectiveLoadKg: 70, reps: 8 },
      { effectiveLoadKg: 70, durationSec: 12 },
      { reps: 5 },
    ])).toEqual({ reps: 13, durationSec: 12, loadReps: 560, loadSeconds: 840 });
  });
});
