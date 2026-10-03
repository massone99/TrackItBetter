import { detectSetRecords, detectVolumeRecords, exerciseRecordSummary, type RecordRow } from '../records';

let n = 0;
function row(overrides: Partial<RecordRow>): RecordRow {
  n += 1;
  return {
    setId: `s${n}`, workoutId: 'old', exerciseId: 'dip', metric: 'reps_load',
    reps: 5, durationSec: null, addedLoadKg: 20, effectiveLoadKg: 20, restBeforeSec: null, ...overrides,
  };
}
function pair(id: string, workoutId: string, left: Partial<RecordRow>, right: Partial<RecordRow>): [RecordRow, RecordRow] {
  return [
    row({ setId: `${id}-l`, pairId: id, side: 'left', workoutId, ...left }),
    row({ setId: `${id}-r`, pairId: id, side: 'right', workoutId, ...right }),
  ];
}
const kinds = (records: ReturnType<typeof detectSetRecords>, setId: string) => records.filter((record) => record.setId === setId).map((record) => record.kind).sort();

describe('detectSetRecords', () => {
  it('reports nothing on the first ever session of an exercise', () => {
    const today = row({ workoutId: 'new', addedLoadKg: 50, effectiveLoadKg: 50 });
    expect(detectSetRecords([today], 'new')).toEqual([]);
  });

  it('finds more load at the same reps, and a better estimated 1RM', () => {
    const today = row({ workoutId: 'new', addedLoadKg: 22.5, effectiveLoadKg: 22.5 });
    expect(kinds(detectSetRecords([row({}), today], 'new'), today.setId)).toEqual(['e1rm', 'loadAtReps']);
  });

  it('finds more reps at the same load, not at a lighter one', () => {
    const history = [row({ reps: 8, addedLoadKg: 10, effectiveLoadKg: 10 }), row({ reps: 5 })];
    const heavier = row({ workoutId: 'new', reps: 6 });
    const lighter = row({ workoutId: 'new', reps: 7, addedLoadKg: 10, effectiveLoadKg: 10 });
    const records = detectSetRecords([...history, heavier, lighter], 'new');
    expect(kinds(records, heavier.setId)).toEqual(['e1rm', 'loadAtReps', 'repsAtLoad']); // 6RM: 20 kg beats 10 kg
    expect(kinds(records, lighter.setId)).toEqual([]);
  });

  it('finds longer holds at the same load for timed exercises', () => {
    const history = [row({ exerciseId: 'fl', metric: 'time', reps: null, durationSec: 10, addedLoadKg: 0, effectiveLoadKg: null })];
    const today = row({ exerciseId: 'fl', workoutId: 'new', metric: 'time', reps: null, durationSec: 12, addedLoadKg: 0, effectiveLoadKg: null });
    expect(detectSetRecords([...history, today], 'new')).toEqual([expect.objectContaining({ setId: today.setId, kind: 'holdAtLoad', value: 12, previous: 10 })]);
  });

  it('finds a shorter rest for at least the same reps and load', () => {
    const history = [row({ restBeforeSec: 180 }), row({ restBeforeSec: 120, reps: 3 })];
    const today = row({ workoutId: 'new', restBeforeSec: 150 });
    expect(detectSetRecords([...history, today], 'new')).toEqual([expect.objectContaining({ kind: 'shorterRest', value: 150, previous: 180 })]);
  });

  it('does not compare shorter rest using synthetic pair amounts or loads', () => {
    const history = pair('rest-old', 'old',
      { reps: 5, addedLoadKg: 20, restBeforeSec: 180 },
      { reps: 5, addedLoadKg: 20, restBeforeSec: 180 });
    const mismatchedAmount = pair('rest-new', 'new',
      { reps: 6, addedLoadKg: 20, restBeforeSec: 120 },
      { reps: 5, addedLoadKg: 20, restBeforeSec: 120 });
    expect(detectSetRecords([...history, ...mismatchedAmount], 'new').map((record) => record.kind)).not.toContain('shorterRest');

    const mismatchedHistory = pair('rest-old-2', 'old',
      { reps: 5, addedLoadKg: 20, restBeforeSec: 180 },
      { reps: 4, addedLoadKg: 20, restBeforeSec: 180 });
    const symmetricCurrent = pair('rest-new-2', 'new',
      { reps: 6, addedLoadKg: 20, restBeforeSec: 120 },
      { reps: 6, addedLoadKg: 20, restBeforeSec: 120 });
    expect(detectSetRecords([...mismatchedHistory, ...symmetricCurrent], 'new').map((record) => record.kind)).not.toContain('shorterRest');
  });

  it('compares later sets of the session with earlier ones too', () => {
    const first = row({ workoutId: 'new', addedLoadKg: 22.5, effectiveLoadKg: 22.5 });
    const second = row({ workoutId: 'new', addedLoadKg: 22.5, effectiveLoadKg: 22.5 });
    const records = detectSetRecords([row({}), first, second], 'new');
    expect(kinds(records, first.setId)).toEqual(['e1rm', 'loadAtReps']);
    expect(kinds(records, second.setId)).toEqual([]);
  });
});

describe('detectVolumeRecords', () => {
  it('reports session volume above every earlier session (kg·rep, reps or seconds)', () => {
    const rows = [
      row({ workoutId: 'a', reps: 5, addedLoadKg: 20 }), row({ workoutId: 'a', reps: 5, addedLoadKg: 20 }),
      row({ workoutId: 'new', reps: 6, addedLoadKg: 20 }), row({ workoutId: 'new', reps: 5, addedLoadKg: 20 }),
      row({ exerciseId: 'push', metric: 'reps', workoutId: 'a', reps: 20, addedLoadKg: 0 }),
      row({ exerciseId: 'push', metric: 'reps', workoutId: 'new', reps: 15, addedLoadKg: 0 }),
      row({ exerciseId: 'new-move', workoutId: 'new' }),
    ];
    expect(detectVolumeRecords(rows, 'new')).toEqual([{ exerciseId: 'dip', value: 220, previous: 200 }]);
  });
});

describe('exerciseRecordSummary', () => {
  it('lists the heaviest load per rep count, best reps, best 1RM and best session volume', () => {
    const rows = [
      row({ workoutId: 'a', reps: 5, addedLoadKg: 20, effectiveLoadKg: 20 }),
      row({ workoutId: 'a', reps: 8, addedLoadKg: 10, effectiveLoadKg: 10 }),
      row({ workoutId: 'b', reps: 5, addedLoadKg: 22.5, effectiveLoadKg: 22.5 }),
      row({ workoutId: 'b', reps: 3, addedLoadKg: 20, effectiveLoadKg: 20 }),
      row({ exerciseId: 'other', workoutId: 'b', reps: 30 }),
    ];
    const summary = exerciseRecordSummary(rows, 'dip');
    expect(summary.repMaxes).toEqual([{ reps: 5, loadKg: 22.5 }, { reps: 8, loadKg: 10 }]); // 3 × 20 is beaten by 5 × 22.5
    expect(summary.bestAmount).toBe(8);
    expect(summary.bestE1rm).toBeCloseTo(26.25);
    expect(summary.bestVolume).toBe(180);
  });

  it('aggregates a unilateral pair for volume and nonlinear e1RM', () => {
    const history = pair('p1', 'old',
      { reps: 8, addedLoadKg: 10, effectiveLoadKg: 10 },
      { reps: 8, addedLoadKg: 10, effectiveLoadKg: 10 });
    const current = pair('p2', 'new',
      { reps: 10, addedLoadKg: 20, effectiveLoadKg: 20 },
      { reps: 8, addedLoadKg: 15, effectiveLoadKg: 15 });
    expect(detectVolumeRecords([...history, ...current], 'new')).toEqual([{ exerciseId: 'dip', value: 160, previous: 80, scope: 'average' }]);
    const summary = exerciseRecordSummary([...history, ...current], 'dip');
    expect(summary.bestVolume).toBe(160);
    expect(summary.bestE1rm).toBeCloseTo(((20 * (1 + 10 / 30)) + (15 * (1 + 8 / 30))) / 2);
  });

  it('keeps average, L/R, and legacy records in separate scopes', () => {
    const history = pair('p1', 'old',
      { reps: 5, addedLoadKg: 20, effectiveLoadKg: 20 },
      { reps: 5, addedLoadKg: 20, effectiveLoadKg: 20 });
    const current = pair('p2', 'new',
      { reps: 7, addedLoadKg: 20, effectiveLoadKg: 20 },
      { reps: 4, addedLoadKg: 20, effectiveLoadKg: 20 });
    const average = detectSetRecords([...history, ...current], 'new');
    expect(kinds(average, 'p2-l')).toEqual(['e1rm', 'repsAtLoad']);
    expect(average.find((record) => record.setId === 'p2-l')).toMatchObject({ scope: 'average' });
    expect(kinds(detectSetRecords([...history, ...current], 'new', 'left'), 'p2-l')).toContain('repsAtLoad');
    expect(kinds(detectSetRecords([...history, ...current], 'new', 'right'), 'p2-r')).toEqual([]);

    const legacyHistory = row({ workoutId: 'old', reps: 5, addedLoadKg: 20, effectiveLoadKg: 20 });
    const legacyCurrent = row({ workoutId: 'new', reps: 6, addedLoadKg: 20, effectiveLoadKg: 20 });
    expect(kinds(detectSetRecords([legacyHistory, legacyCurrent], 'new', 'legacy'), legacyCurrent.setId)).toContain('repsAtLoad');
  });

  it('does not create constrained records from mismatched sides', () => {
    const history = pair('p1', 'old',
      { reps: 5, addedLoadKg: 15, effectiveLoadKg: 15 },
      { reps: 5, addedLoadKg: 15, effectiveLoadKg: 15 });
    const current = pair('p2', 'new',
      { reps: 12, addedLoadKg: 20, effectiveLoadKg: 20 },
      { reps: 8, addedLoadKg: 15, effectiveLoadKg: 15 });
    expect(kinds(detectSetRecords([...history, ...current], 'new'), current[0].setId)).toEqual(['e1rm']);
  });

  it('uses average records only by default when paired and legacy data coexist', () => {
    const legacy = row({ workoutId: 'old', reps: 30, addedLoadKg: 20, effectiveLoadKg: 20 });
    const paired = pair('summary-pair', 'new',
      { reps: 5, addedLoadKg: 10, effectiveLoadKg: 10 },
      { reps: 5, addedLoadKg: 10, effectiveLoadKg: 10 });
    expect(exerciseRecordSummary([legacy, ...paired], 'dip').bestVolume).toBe(50);
    expect(exerciseRecordSummary([legacy, ...paired], 'dip', 'legacy').bestVolume).toBe(600);
  });
});
