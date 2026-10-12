import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { createCustomExercise } from '../../exercises/customRepository';
import { completeSet, finishWorkout, updateSet, getActiveWorkout, getCompletedWorkout, getPreviousPerformance, setSetFormRating, updateWorkoutDetails } from '../../session/repository';
import { logPastUserProgramSession, startUserProgramSession } from '../startUserSession';
import { getUserProgram, saveUserProgram } from '../userPrograms';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
const { mockReal: real } = jest.requireMock('../../../db/client');

beforeAll(async () => {
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
});

const custom = (name: string, metric: 'reps' | 'reps_load' | 'time' | 'distance') => createCustomExercise({
  name, category: 'push', extraCategories: [], metric, equipment: [], cues: [], demoUrl: null, movementTag: null, movementGroup: null,
});

describe('starting a workout from a program', () => {
  it('copies the prescribed workout notes, then the two stay independent', async () => {
    const id = await custom('Notes press', 'reps');
    const saved = await saveUserProgram({ name: 'N', sessions: [{ id: 's1', name: 'A', notes: '  Slow negatives  ', exercises: [{ id: 'e', exerciseId: id, sets: 1, target: 5 }] }] });
    const program = (await getUserProgram(saved.id))!;
    expect(program.sessions[0].notes).toBe('Slow negatives');

    const workoutId = await startUserProgramSession(program, program.sessions[0]);
    expect((await getActiveWorkout(workoutId))!.notes).toBe('Slow negatives');

    await updateWorkoutDetails(workoutId, { name: 'Renamed', notes: 'Felt heavy' });
    expect(await getActiveWorkout(workoutId)).toMatchObject({ name: 'Renamed', notes: 'Felt heavy' });
    expect((await getUserProgram(saved.id))!.sessions[0]).toMatchObject({ name: 'A', notes: 'Slow negatives' });
    real.sqlite.prepare('DELETE FROM workout').run();
  });

  it('starts a program made of custom exercises of every measure', async () => {
    const ids = [await custom('My press', 'reps_load'), await custom('My hold', 'time'), await custom('My run', 'distance'), await custom('My reps', 'reps')];
    const saved = await saveUserProgram({
      name: 'Mine',
      sessions: [{ id: 's1', name: 'A', exercises: ids.map((exerciseId, index) => ({ id: `e${index}`, exerciseId, sets: 3, target: 10, restSeconds: 90, loadKg: index === 0 ? 20 : null })) }],
    });
    const program = (await getUserProgram(saved.id))!;

    const workoutId = await startUserProgramSession(program, program.sessions[0]);

    const workout = (await getActiveWorkout(workoutId))!;
    expect(workout.exercises).toHaveLength(4);
    expect(workout.exercises.every((exercise) => exercise.sets.length === 3)).toBe(true);
    expect(workout.exercises[0].sets[0]).toMatchObject({ addedLoadKg: 20, restSec: 90 });
    real.sqlite.prepare('DELETE FROM workout').run();
  });

  it('starts the sets from what was done the last time the same workout was done', async () => {
    const press = await custom('Repeat press', 'reps_load');
    const saved = await saveUserProgram({ name: 'Repeat', sessions: [{ id: 's1', name: 'Day', exercises: [{ id: 'e', exerciseId: press, sets: 3, target: 8, loadKg: 20 }] }] });
    const program = (await getUserProgram(saved.id))!;

    const first = await startUserProgramSession(program, program.sessions[0]);
    const firstSets = (await getActiveWorkout(first))!.exercises[0].sets;
    expect(firstSets.map((set) => [set.reps, set.addedLoadKg])).toEqual([[8, 20], [8, 20], [8, 20]]);
    await updateSet(firstSets[0].id, 'reps', 10);
    await updateSet(firstSets[0].id, 'addedLoadKg', 22.5);
    await updateSet(firstSets[1].id, 'reps', 9);
    await completeSet(firstSets[0].id);
    await completeSet(firstSets[1].id);
    await finishWorkout(first);

    const second = await startUserProgramSession(program, program.sessions[0]);
    // Two sets were done last time: the third repeats the last one done.
    expect((await getActiveWorkout(second))!.exercises[0].sets.map((set) => [set.reps, set.addedLoadKg])).toEqual([[10, 22.5], [9, 20], [9, 20]]);
    real.sqlite.prepare('DELETE FROM workout').run();
  });

  it('leaves no half-started workout behind when the program cannot be started', async () => {
    const program = { id: 'p', name: 'Broken', updatedAt: '', sessions: [{ id: 's', name: 'A', exercises: [{ id: 'e', exerciseId: 'gone-exercise', sets: 3, target: 8, restSeconds: 90 }] }] };
    await expect(startUserProgramSession(program, program.sessions[0])).rejects.toThrow();
    expect(await getActiveWorkout()).toBeNull();
  });

  it('deletes the new workout when its sets cannot be written', async () => {
    const program = { id: 'bad', name: 'Bad', updatedAt: '', sessions: [{ id: 's', name: 'A', exercises: [{ id: 'e', exerciseId: 'push-up', sets: 2, target: -3, restSeconds: 90 }] }] };
    await expect(startUserProgramSession(program, program.sessions[0])).rejects.toThrow();
    expect(await getActiveWorkout()).toBeNull();
  });

  it('skips movements that no longer exist and starts with the rest', async () => {
    const program = { id: 'p2', name: 'Half', updatedAt: '', sessions: [{ id: 's', name: 'A', exercises: [
      { id: 'e1', exerciseId: 'gone-exercise', sets: 3, target: 8, restSeconds: 90 },
      { id: 'e2', exerciseId: 'push-up', sets: 2, target: 8, restSeconds: 60 },
    ] }] };
    const workoutId = await startUserProgramSession(program, program.sessions[0]);
    expect((await getActiveWorkout(workoutId))!.exercises.map((exercise) => [exercise.exerciseId, exercise.sets.length])).toEqual([['push-up', 2]]);
  });

  it('leaves the rest of the sets empty when the program sets none, so the default rest applies', async () => {
    const program = { id: 'p3', name: 'NoRest', updatedAt: '', sessions: [{ id: 's', name: 'A', exercises: [
      { id: 'e1', exerciseId: 'push-up', sets: 1, target: 8, restSeconds: null },
      { id: 'e2', exerciseId: 'pull-up', sets: 2, target: 5 },
      { id: 'e3', exerciseId: 'tuck-planche', sets: 1, target: 5, restSeconds: 45 },
    ] }] };
    const workoutId = await startUserProgramSession(program, program.sessions[0]);
    const rests = (await getActiveWorkout(workoutId))!.exercises.map((exercise) => exercise.sets.map((set) => set.restSec));
    expect(rests).toEqual([[null], [null, null], [45]]);
  });
});

describe('logging a program workout as a past session', () => {
  beforeAll(() => { real.sqlite.prepare('DELETE FROM workout').run(); });
  const program = { id: 'pp', name: 'Past', updatedAt: '', sessions: [{ id: 's', name: 'A', exercises: [{ id: 'e1', exerciseId: 'push-up', sets: 3, target: 8, restSeconds: 60 }] }] };

  it('creates a finished workout at the given time with every set done', async () => {
    const startedAt = new Date(Date.now() - 3 * 24 * 3600_000);
    const workoutId = await logPastUserProgramSession(program, program.sessions[0], startedAt, 45);

    const workout = (await getCompletedWorkout(workoutId))!;
    expect(workout.name).toBe('Past · A');
    expect(workout.startedAt.getTime()).toBe(startedAt.getTime());
    expect(workout.endedAt.getTime() - workout.startedAt.getTime()).toBe(45 * 60_000);
    expect(workout.exercises[0].sets).toHaveLength(3);
    expect(workout.exercises[0].sets.every((set) => set.completedAt && set.reps === 8)).toBe(true);
    expect(await getActiveWorkout()).toBeNull();
  });

  it('leaves nothing behind when the start is in the future', async () => {
    await expect(logPastUserProgramSession(program, program.sessions[0], new Date(Date.now() + 3600_000), 60)).rejects.toThrow();
    expect(await getActiveWorkout()).toBeNull();
  });
});

describe('program exercises without a target', () => {
  it('start with the note on the exercise and last time\'s reps at each set', async () => {
    real.sqlite.prepare('DELETE FROM workout').run();
    const first = { id: 'op', name: 'Open', updatedAt: '', sessions: [{ id: 's', name: 'A', exercises: [{ id: 'e', exerciseId: 'push-up', sets: 2, target: 12, restSeconds: null }] }] };
    const done = await logPastUserProgramSession(first, first.sessions[0], new Date(Date.now() - 3600_000 * 24), 30);
    expect(done).toBeTruthy();

    const open = { id: 'op', name: 'Open', updatedAt: '', sessions: [{ id: 's', name: 'A', exercises: [{ id: 'e', exerciseId: 'push-up', sets: 2, target: null, note: '10–12 reps, slow', restSeconds: null }] }] };
    const workoutId = await startUserProgramSession(open, open.sessions[0]);

    const workout = (await getActiveWorkout(workoutId))!;
    expect(workout.exercises[0].notes).toBe('10–12 reps, slow');
    expect(workout.exercises[0].sets.map((set) => set.reps)).toEqual([12, 12]);
  });
});

describe('RPE targets and form', () => {
  it('writes the planned RPE on every set, shared or set by set', async () => {
    const program = { id: 'rpe', name: 'RPE', updatedAt: '', sessions: [{ id: 's', name: 'A', exercises: [
      { id: 'a', exerciseId: 'push-up', sets: 2, target: 8, rpe: 8 },
      { id: 'b', exerciseId: 'pull-up', sets: 3, target: 5, rpePerSet: [7, 8, 9] },
    ] }] };
    const workoutId = await startUserProgramSession(program, program.sessions[0]);
    const workout = (await getActiveWorkout(workoutId))!;
    expect(workout.exercises[0].sets.map((set) => set.targetRpe)).toEqual([8, 8]);
    expect(workout.exercises[1].sets.map((set) => set.targetRpe)).toEqual([7, 8, 9]);

    for (const set of workout.exercises[1].sets) { await completeSet(set.id); await setSetFormRating(set.id, 4); }
    await finishWorkout(workoutId);
    const previous = await getPreviousPerformance(['pull-up'], 'none');
    expect(previous.get('pull-up')?.sets.map((set) => set.formRating)).toEqual([4, 4, 4]);
    expect((await getCompletedWorkout(workoutId))?.exercises[1].sets[0].formRating).toBe(4);
    await expect(setSetFormRating(workout.exercises[1].sets[0].id, 6)).rejects.toThrow();
  });
});
