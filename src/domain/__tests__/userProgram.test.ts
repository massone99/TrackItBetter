import {
  duplicateSession,
  estimateSessionSeconds,
  moveItem,
  newPrescription,
  nextSessionInRotation,
  plannedLoads,
  replaceExercise,
  programSessionWorkoutName,
  sessionSetCount,
  validateUserProgram,
  type UserProgram,
  type UserProgramExercise,
  type UserProgramSession,
} from '../userProgram';

function exercise(overrides: Partial<UserProgramExercise> = {}): UserProgramExercise {
  return { id: 'e1', exerciseId: 'push-up', sets: 3, target: 8, restSeconds: 90, ...overrides };
}

function session(overrides: Partial<UserProgramSession> = {}): UserProgramSession {
  return { id: 's1', name: 'Push', exercises: [exercise()], ...overrides };
}

function program(overrides: Partial<UserProgram> = {}): UserProgram {
  return { id: 'p1', name: 'Plan', sessions: [session()], updatedAt: '2026-09-01T00:00:00Z', ...overrides };
}

describe('validateUserProgram', () => {
  it('accepts a complete program', () => {
    expect(validateUserProgram(program())).toEqual([]);
  });

  it('reports each problem with the day and movement it belongs to', () => {
    const errors = validateUserProgram(program({
      name: ' ',
      sessions: [session({ id: 'a', name: '', exercises: [] }), session({ id: 'b', exercises: [exercise({ id: 'x', sets: 0 })] })],
    }));
    expect(errors).toEqual([
      { code: 'nameMissing' },
      { code: 'sessionNameMissing', sessionId: 'a' },
      { code: 'sessionEmpty', sessionId: 'a' },
      { code: 'invalidValue', sessionId: 'b', exerciseId: 'x' },
    ]);
  });

  it('needs at least one day', () => {
    expect(validateUserProgram(program({ sessions: [] }))).toEqual([{ code: 'noSessions' }]);
  });

  it('rejects a negative load but accepts an open one', () => {
    expect(validateUserProgram(program({ sessions: [session({ exercises: [exercise({ loadKg: null })] })] }))).toEqual([]);
    expect(validateUserProgram(program({ sessions: [session({ exercises: [exercise({ loadKg: -5 })] })] }))).toHaveLength(1);
  });
});

describe('moveItem', () => {
  it('moves up and down and ignores moves past the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('duplicateSession', () => {
  it('copies movements with new ids', () => {
    let n = 0;
    const source = session({ exercises: [exercise({ id: 'e1' }), exercise({ id: 'e2' })] });
    const copy = duplicateSession(source, () => `id${++n}`);
    expect(copy.id).toBe('id1');
    expect(copy.name).toBe('Push');
    expect(copy.exercises.map((item) => item.id)).toEqual(['id2', 'id3']);
    expect(copy.exercises[0].exerciseId).toBe('push-up');
  });
});

describe('estimateSessionSeconds', () => {
  it('counts work and rest, without the rest after the last set', () => {
    const metrics = new Map([['push-up', 'reps'], ['plank', 'time']]);
    const day = session({ exercises: [exercise({ sets: 2, target: 10, restSeconds: 60 }), exercise({ exerciseId: 'plank', sets: 1, target: 30, restSeconds: 45 })] });
    // push-ups: 2 × (30 + 60) = 180; plank: 30 + 45 = 75; minus the final 45 s rest.
    expect(estimateSessionSeconds(day, metrics)).toBe(210);
  });

  it('is zero for an empty day', () => {
    expect(estimateSessionSeconds(session({ exercises: [] }), new Map())).toBe(0);
  });
});

describe('session helpers', () => {
  it('counts sets', () => {
    expect(sessionSetCount(session({ exercises: [exercise({ sets: 4 }), exercise({ sets: 2 })] }))).toBe(6);
  });
});

describe('nextSessionInRotation', () => {
  const plan = program({ name: 'Plan', sessions: [session({ id: 'a', name: 'A' }), session({ id: 'b', name: 'B' }), session({ id: 'c', name: 'C' })] });

  it('starts from the first workout when none was done yet', () => {
    expect(nextSessionInRotation(plan, ['Something else']).id).toBe('a');
  });

  it('proposes the workout after the latest one done, wrapping around', () => {
    expect(nextSessionInRotation(plan, ['Plan · A', 'Plan · C']).id).toBe('b');
    expect(nextSessionInRotation(plan, ['Other · A', 'Plan · C', 'Plan · B']).id).toBe('a');
  });

  it('names workouts after program and session', () => {
    expect(programSessionWorkoutName(plan, plan.sessions[1])).toBe('Plan · B');
  });
});

describe('plannedLoads', () => {
  it('uses the planned load for every set', () => {
    expect(plannedLoads({ sets: 3, loadKg: 20 }, [10, 12])).toEqual([20, 20, 20]);
  });

  it('falls back to last time per set, repeating its last set', () => {
    expect(plannedLoads({ sets: 3, loadKg: null }, [10, 12])).toEqual([10, 12, 12]);
    expect(plannedLoads({ sets: 2 }, [])).toEqual([0, 0]);
  });
});

describe('replaceExercise', () => {
  it('keeps sets, rest and target when the kind of measure stays the same', () => {
    const swapped = replaceExercise(exercise({ sets: 4, target: 6, restSeconds: 120, loadKg: 10 }), 'ring-dip', 'reps_load', 'reps_load');
    expect(swapped).toEqual(exercise({ exerciseId: 'ring-dip', sets: 4, target: 6, restSeconds: 120, loadKg: 10 }));
  });

  it('resets the target for the new measure and drops a load the new exercise cannot carry', () => {
    const toHold = replaceExercise(exercise({ target: 6, loadKg: 10 }), 'plank', 'reps_load', 'time');
    expect(toHold).toMatchObject({ exerciseId: 'plank', sets: 3, target: 30, loadKg: null });
    expect(replaceExercise(exercise({ target: 30 }), 'run', 'time', 'distance').target).toBe(100);
    expect(replaceExercise(exercise({ target: 30 }), 'squat', 'time', 'reps').target).toBe(8);
  });

  it('keeps the load between weighted exercises of different measures only when both carry load', () => {
    expect(replaceExercise(exercise({ target: 8, loadKg: 5 }), 'hold', 'reps_load', 'time_load').loadKg).toBe(5);
  });
});

describe('newPrescription', () => {
  it('starts with one set and a target that fits the measure', () => {
    expect(newPrescription('a', 'reps', () => 'x')).toEqual({ id: 'x', exerciseId: 'a', sets: 1, target: 8, restSeconds: 90, loadKg: null });
    expect(newPrescription('a', 'time_load', () => 'x')).toMatchObject({ sets: 1, target: 30 });
    expect(newPrescription('a', 'distance', () => 'x')).toMatchObject({ sets: 1, target: 100 });
  });
});
