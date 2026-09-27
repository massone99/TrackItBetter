import {
  calculateEffectiveLoad,
  calculateVolume,
  detectPersonalRecords,
  estimateBodyweightInclusiveOneRepMax,
  estimateOneRepMax,
  evaluateProgression,
  kilogramsToPounds,
  meetsProgressionTarget,
  poundsToKilograms,
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
