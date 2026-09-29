import { detectSetRecords, detectVolumeRecords, exerciseRecordSummary, type RecordRow } from '../records';

let n = 0;
function row(overrides: Partial<RecordRow>): RecordRow {
  n += 1;
  return {
    setId: `s${n}`, workoutId: 'old', exerciseId: 'dip', metric: 'reps_load',
    reps: 5, durationSec: null, addedLoadKg: 20, effectiveLoadKg: 20, restBeforeSec: null, ...overrides,
  };
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
});
