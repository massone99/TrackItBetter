import {
  duplicateSession,
  estimateSessionSeconds,
  moveItem,
  nextFreeWeekday,
  plannedLoads,
  sessionSetCount,
  sessionsForWeekday,
  sortByWeekday,
  validateUserProgram,
  type UserProgram,
  type UserProgramExercise,
  type UserProgramSession,
} from '../userProgram';

function exercise(overrides: Partial<UserProgramExercise> = {}): UserProgramExercise {
  return { id: 'e1', exerciseId: 'push-up', sets: 3, target: 8, restSeconds: 90, ...overrides };
}

function session(overrides: Partial<UserProgramSession> = {}): UserProgramSession {
  return { id: 's1', weekday: 1, name: 'Push', exercises: [exercise()], ...overrides };
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

describe('nextFreeWeekday', () => {
  it('starts on Monday for an empty week', () => {
    expect(nextFreeWeekday([])).toBe(1);
  });

  it('skips used days and wraps past Sunday', () => {
    expect(nextFreeWeekday([{ weekday: 1 }, { weekday: 2 }])).toBe(3);
    expect(nextFreeWeekday([{ weekday: 0 }, { weekday: 1 }], 0)).toBe(2);
  });
});

describe('duplicateSession', () => {
  it('copies movements with new ids onto the next free day', () => {
    let n = 0;
    const source = session({ weekday: 1, exercises: [exercise({ id: 'e1' }), exercise({ id: 'e2' })] });
    const copy = duplicateSession(source, [source], () => `id${++n}`);
    expect(copy.id).toBe('id1');
    expect(copy.weekday).toBe(2);
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
  it('counts sets and finds the days planned on a weekday', () => {
    const plan = program({ sessions: [session({ id: 'a', weekday: 3 }), session({ id: 'b', weekday: 5, exercises: [exercise({ sets: 4 }), exercise({ sets: 2 })] })] });
    expect(sessionSetCount(plan.sessions[1])).toBe(6);
    expect(sessionsForWeekday([plan], 5).map((item) => item.session.id)).toEqual(['b']);
    expect(sessionsForWeekday([plan], 0)).toEqual([]);
  });

  it('sorts Monday first and keeps the entered order on the same day', () => {
    const sorted = sortByWeekday([session({ id: 'sun', weekday: 0 }), session({ id: 'mon2', weekday: 1 }), session({ id: 'mon1', weekday: 1 })]);
    expect(sorted.map((item) => item.id)).toEqual(['mon2', 'mon1', 'sun']);
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
