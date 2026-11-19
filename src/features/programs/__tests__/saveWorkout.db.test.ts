import { migrateDatabase } from '../../../db/migrations';
import { saveWorkoutToProgram } from '../saveWorkout';
import { getUserProgram, listUserPrograms, saveUserProgram } from '../userPrograms';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
const { mockReal: real } = jest.requireMock('../../../db/client');

beforeAll(async () => { await migrateDatabase(real.expo); });
beforeEach(() => { real.sqlite.prepare("DELETE FROM settings WHERE key = 'user_weekly_programs_v1'").run(); });

const set = (over: object) => ({ kind: 'working', reps: 8, durationSec: null, distanceM: null, addedLoadKg: 0, restSec: null, ...over });
const exercises = [{ exerciseId: 'push-up', metric: 'reps', notes: 'slow', sets: [set({}), set({})] }];

describe('programs without workouts', () => {
  it('can be saved and are kept', async () => {
    const saved = await saveUserProgram({ name: 'Empty', sessions: [] });
    expect((await getUserProgram(saved.id))?.sessions).toEqual([]);
    expect(await listUserPrograms()).toHaveLength(1);
  });
});

describe('saving a workout to a program', () => {
  it('creates a new program around it', async () => {
    const program = await saveWorkoutToProgram({ target: { kind: 'new', programName: 'Mine' }, workoutName: 'Push A', exercises });
    const [stored] = await listUserPrograms();
    expect(stored.id).toBe(program.id);
    expect(stored.sessions[0]).toMatchObject({ name: 'Push A', exercises: [{ exerciseId: 'push-up', sets: 2, target: 8, note: 'slow' }] });
  });

  it('adds it to an existing program, after its other workouts', async () => {
    const base = await saveWorkoutToProgram({ target: { kind: 'new', programName: 'Mine' }, workoutName: 'A', exercises });
    const updated = await saveWorkoutToProgram({ target: { kind: 'existing', programId: base.id }, workoutName: 'B', exercises });
    expect(updated.sessions.map((session) => session.name)).toEqual(['A', 'B']);
    expect((await listUserPrograms())[0].sessions).toHaveLength(2);
  });

  it('adds it to a program that had no workouts', async () => {
    const empty = await saveUserProgram({ name: 'Empty', sessions: [] });
    const updated = await saveWorkoutToProgram({ target: { kind: 'existing', programId: empty.id }, workoutName: 'First', exercises });
    expect(updated.sessions.map((session) => session.name)).toEqual(['First']);
  });

  it('refuses a program that does not exist', async () => {
    await expect(saveWorkoutToProgram({ target: { kind: 'existing', programId: 'nope' }, workoutName: 'B', exercises })).rejects.toThrow();
  });
});

describe('replacing a prescribed workout', () => {
  const bigger = [{ exerciseId: 'push-up', metric: 'reps', notes: 'slow', sets: [set({}), set({}), set({ reps: 12 })] }, { exerciseId: 'dip', metric: 'reps', notes: null, sets: [set({})] }];

  it('updates that workout in place, keeping its id and name, and nothing else', async () => {
    const base = await saveWorkoutToProgram({ target: { kind: 'new', programName: 'Mine' }, workoutName: 'A', exercises });
    const withB = await saveWorkoutToProgram({ target: { kind: 'existing', programId: base.id }, workoutName: 'B', exercises });
    const [a, b] = (await getUserProgram(withB.id))!.sessions;
    const updated = await saveWorkoutToProgram({ target: { kind: 'replace', programId: base.id, sessionId: a.id }, workoutName: 'ignored', exercises: bigger });
    expect(updated.sessions.map((session) => [session.id, session.name])).toEqual([[a.id, 'A'], [b.id, 'B']]);
    expect(updated.sessions[0].exercises.map((exercise) => exercise.exerciseId)).toEqual(['push-up', 'dip']);
    expect(updated.sessions[1]).toEqual(b);
  });

  it('is never what saving as new does, even under the same name', async () => {
    const base = await saveWorkoutToProgram({ target: { kind: 'new', programName: 'Mine' }, workoutName: 'A', exercises });
    const original = (await getUserProgram(base.id))!.sessions[0];
    const copy = await saveWorkoutToProgram({ target: { kind: 'existing', programId: base.id }, workoutName: 'A (2)', exercises: bigger });
    expect(copy.sessions).toHaveLength(2);
    expect(copy.sessions[0]).toEqual(original);
    const fresh = await saveWorkoutToProgram({ target: { kind: 'new', programName: 'Other' }, workoutName: 'A', exercises: bigger });
    expect((await getUserProgram(base.id))?.sessions[0]).toEqual(original);
    expect(fresh.id).not.toBe(base.id);
  });

  it('refuses a workout that no longer exists', async () => {
    const base = await saveWorkoutToProgram({ target: { kind: 'new', programName: 'Mine' }, workoutName: 'A', exercises });
    const before = (await getUserProgram(base.id))!.sessions[0];
    await expect(saveWorkoutToProgram({ target: { kind: 'replace', programId: base.id, sessionId: 'gone' }, workoutName: 'A', exercises })).rejects.toThrow();
    expect((await getUserProgram(base.id))?.sessions[0]).toEqual(before);
  });
});
