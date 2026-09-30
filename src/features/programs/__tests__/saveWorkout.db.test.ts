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
