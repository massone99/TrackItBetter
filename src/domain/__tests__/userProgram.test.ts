import {
  duplicateSession,
  estimateSessionSeconds,
  isValidPrescription,
  moveItem,
  newPrescription,
  nextSessionInRotation,
  plannedLoads,
  replaceExercise,
  programSessionWorkoutName,
  sessionFromWorkout,
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

  it('accepts a program with no workouts yet', () => {
    expect(validateUserProgram(program({ sessions: [] }))).toEqual([]);
  });

  it('rejects a negative load but accepts an open one', () => {
    expect(validateUserProgram(program({ sessions: [session({ exercises: [exercise({ loadKg: null })] })] }))).toEqual([]);
    expect(validateUserProgram(program({ sessions: [session({ exercises: [exercise({ loadKg: -5 })] })] }))).toHaveLength(1);
  });
});

describe('rest is optional', () => {
  it('accepts a movement without a rest, but not a negative or fractional one', () => {
    expect(validateUserProgram(program({ sessions: [session({ exercises: [exercise({ restSeconds: null })] })] }))).toEqual([]);
    const { restSeconds: _rest, ...withoutRest } = exercise();
    expect(validateUserProgram(program({ sessions: [session({ exercises: [withoutRest as UserProgramExercise] })] }))).toEqual([]);
    expect(validateUserProgram(program({ sessions: [session({ exercises: [exercise({ restSeconds: -5 })] })] })).map((error) => error.code)).toEqual(['invalidValue']);
    expect(validateUserProgram(program({ sessions: [session({ exercises: [exercise({ restSeconds: 30.5 })] })] })).map((error) => error.code)).toEqual(['invalidValue']);
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

  it('uses the default rest for movements without one of their own', () => {
    const day = session({ exercises: [exercise({ sets: 2, target: 10, restSeconds: null }), exercise({ sets: 1, target: 10 })] });
    // 2 × (30 + 90) + (30 + 90), minus the final 90 s rest; a movement with no rest field counts the same.
    expect(estimateSessionSeconds(day, new Map(), 90)).toBe(270);
    expect(estimateSessionSeconds(day, new Map(), 60)).toBe(210);
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
    expect(nextSessionInRotation(plan, ['Something else'])?.id).toBe('a');
  });

  it('proposes the workout after the latest one done, wrapping around', () => {
    expect(nextSessionInRotation(plan, ['Plan · A', 'Plan · C'])?.id).toBe('b');
    expect(nextSessionInRotation(plan, ['Other · A', 'Plan · C', 'Plan · B'])?.id).toBe('a');
  });

  it('has nothing to propose for a program without workouts', () => {
    expect(nextSessionInRotation(program({ sessions: [] }), ['Plan · A'])).toBeNull();
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
    expect(toHold).toMatchObject({ exerciseId: 'plank', sets: 3, target: null, loadKg: null });
    expect(replaceExercise(exercise({ target: 30 }), 'run', 'time', 'distance').target).toBeNull();
    expect(replaceExercise(exercise({ target: 30 }), 'squat', 'time', 'reps').target).toBeNull();
  });

  it('keeps an open target open', () => {
    expect(replaceExercise(exercise({ target: null }), 'ring-dip', 'reps', 'reps').target).toBeNull();
  });

  it('keeps the load between weighted exercises of different measures only when both carry load', () => {
    expect(replaceExercise(exercise({ target: 8, loadKg: 5 }), 'hold', 'reps_load', 'time_load').loadKg).toBe(5);
  });
});

describe('newPrescription', () => {
  it('starts with one set and no target, so a workout can be drafted without deciding reps', () => {
    expect(newPrescription('a', 'reps', () => 'x')).toEqual({ id: 'x', exerciseId: 'a', sets: 1, target: null, note: null, restSeconds: null, loadKg: null });
  });
});

describe('prescriptions without a target', () => {
  it('are valid, with or without a note', () => {
    expect(isValidPrescription(exercise({ target: null }))).toBe(true);
    expect(isValidPrescription(exercise({ target: null, note: '6–8 reps' }))).toBe(true);
    expect(isValidPrescription(exercise({ target: 0 }))).toBe(false);
    expect(isValidPrescription(exercise({ note: 'x'.repeat(1001) }))).toBe(false);
  });

  it('count as a default effort when the duration of a workout is estimated', () => {
    const open = estimateSessionSeconds({ exercises: [exercise({ target: null, sets: 2, restSeconds: 60 })] }, new Map([['push-up', 'reps']]));
    const fixed = estimateSessionSeconds({ exercises: [exercise({ target: 8, sets: 2, restSeconds: 60 })] }, new Map([['push-up', 'reps']]));
    expect(open).toBe(fixed);
  });
});

describe('sessionFromWorkout', () => {
  const set = (over: object) => ({ kind: 'working', reps: 8, durationSec: null, distanceM: null, addedLoadKg: 0, restSec: null, ...over });
  let counter = 0;
  const newId = () => `id${counter += 1}`;

  it('turns a workout into a workout of a program: working sets, first set as target, load, rest and note', () => {
    const result = sessionFromWorkout(' Push A ', [
      { exerciseId: 'dip', metric: 'reps_load', notes: ' slow ', sets: [set({ kind: 'warmup', reps: 5 }), set({ reps: 6, addedLoadKg: 10, restSec: 120 }), set({ reps: 5, addedLoadKg: 10 })] },
      { exerciseId: 'plank', metric: 'time', notes: null, sets: [set({ reps: null, durationSec: 30 })] },
    ], newId);
    expect(result.name).toBe('Push A');
    expect(result.exercises).toMatchObject([
      { exerciseId: 'dip', sets: 2, target: 6, loadKg: 10, restSeconds: 120, note: 'slow' },
      { exerciseId: 'plank', sets: 1, target: 30, loadKg: null, restSeconds: null, note: null },
    ]);
    expect(validateUserProgram({ name: 'P', sessions: [result] })).toEqual([]);
  });

  it('leaves the target open when the first set has no value, and keeps warm-up-only exercises', () => {
    const result = sessionFromWorkout('A', [
      { exerciseId: 'a', metric: 'reps', notes: null, sets: [set({ reps: 0 })] },
      { exerciseId: 'b', metric: 'reps', notes: null, sets: [set({ kind: 'warmup', reps: 10 })] },
      { exerciseId: 'c', metric: 'reps', notes: null, sets: [] },
    ], newId);
    expect(result.exercises.map((item) => [item.sets, item.target])).toEqual([[1, null], [1, 10], [1, null]]);
  });
});
