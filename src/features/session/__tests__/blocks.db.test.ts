import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { addExerciseToWorkout, getActiveWorkout, linkWithNext, moveExerciseEntry, setEntryBlock, startWorkout } from '../repository';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
const { mockReal: real } = jest.requireMock('../../../db/client');

beforeAll(async () => { await migrateDatabase(real.expo); await seedCatalogIfEmpty(real.db); });
beforeEach(() => { real.sqlite.prepare('DELETE FROM workout').run(); });

async function build(ids = ['push-up', 'pull-up', 'chin-up', 'parallel-bar-dip']) {
  const workoutId = await startWorkout('W');
  const entries: string[] = [];
  for (const exerciseId of ids) entries.push(await addExerciseToWorkout(workoutId, exerciseId));
  return { workoutId, entries };
}
const view = async (workoutId: string) => (await getActiveWorkout(workoutId))!.exercises.map((exercise) => `${exercise.exerciseId}:${exercise.block}`);

describe('workout blocks', () => {
  it('keeps blocks contiguous: warm-up first, mobility last', async () => {
    const { workoutId, entries } = await build();
    await setEntryBlock(entries[2], 'warmup');
    await setEntryBlock(entries[0], 'mobility');
    expect(await view(workoutId)).toEqual(['chin-up:warmup', 'pull-up:main', 'parallel-bar-dip:main', 'push-up:mobility']);
  });

  it('adds a new exercise at the end of the main work, before mobility', async () => {
    const { workoutId, entries } = await build(['push-up', 'pull-up']);
    await setEntryBlock(entries[1], 'mobility');
    await addExerciseToWorkout(workoutId, 'chin-up');
    expect(await view(workoutId)).toEqual(['push-up:main', 'chin-up:main', 'pull-up:mobility']);
  });

  it('puts a mobility exercise added to a workout of other exercises in the mobility block', async () => {
    const { workoutId } = await build(['push-up', 'pull-up']);
    await addExerciseToWorkout(workoutId, 'pike-stretch');
    expect(await view(workoutId)).toEqual(['push-up:main', 'pull-up:main', 'pike-stretch:mobility']);
    const mobilityOnly = await startWorkout('M');
    await addExerciseToWorkout(mobilityOnly, 'pike-stretch');
    expect(await view(mobilityOnly)).toEqual(['pike-stretch:main']);
  });

  it('gives a dragged exercise the block of the exercise above it', async () => {
    const { workoutId, entries } = await build();
    await setEntryBlock(entries[3], 'mobility');
    await moveExerciseEntry(workoutId, entries[3], 0);
    expect(await view(workoutId)).toEqual(['parallel-bar-dip:main', 'push-up:main', 'pull-up:main', 'chin-up:main']);
    await setEntryBlock(entries[0], 'warmup');
    await moveExerciseEntry(workoutId, entries[2], 1);
    expect(await view(workoutId)).toEqual(['push-up:warmup', 'chin-up:warmup', 'parallel-bar-dip:main', 'pull-up:main']);
  });

  it('takes an exercise out of its superset when its block changes', async () => {
    const { workoutId, entries } = await build();
    await linkWithNext(entries[0]);
    await setEntryBlock(entries[1], 'mobility');
    const groups = (await getActiveWorkout(workoutId))!.exercises.map((exercise) => exercise.groupId);
    expect(groups.every((group) => group === null)).toBe(true);
  });
});

describe('addWarmupSet', () => {
  const sets = (workoutId: string) => real.sqlite
    .prepare('SELECT s.set_index AS idx, s.kind AS kind, s.reps AS reps, s.side AS side FROM training_set s JOIN exercise_entry e ON e.id = s.entry_id WHERE e.workout_id = ? ORDER BY s.set_index, s.side')
    .all(workoutId) as { idx: number; kind: string; reps: number; side: string }[];

  it('puts warm-ups first, after the warm-ups already there, and renumbers the rest', async () => {
    const { addWarmupSet } = jest.requireActual('../repository');
    const { addSet } = jest.requireActual('../repository');
    const workoutId = await startWorkout('W');
    await addExerciseToWorkout(workoutId, 'push-up');
    const entry = (real.sqlite.prepare('SELECT id FROM exercise_entry WHERE workout_id = ?').get(workoutId) as { id: string }).id;
    await addSet(entry);
    await addWarmupSet(entry);
    await addWarmupSet(entry);
    expect(sets(workoutId).map(({ idx, kind }) => `${idx}:${kind}`)).toEqual(['1:warmup', '2:warmup', '3:working', '4:working']);
  });

  it('adds a left/right pair for a unilateral exercise', async () => {
    const { addWarmupSet } = jest.requireActual('../repository');
    const workoutId = await startWorkout('W');
    await addExerciseToWorkout(workoutId, 'reverse-lunge');
    const entry = (real.sqlite.prepare('SELECT id FROM exercise_entry WHERE workout_id = ?').get(workoutId) as { id: string }).id;
    await addWarmupSet(entry);
    expect(sets(workoutId).map(({ idx, kind, side }) => `${idx}:${kind}:${side}`)).toEqual(['1:warmup:left', '1:warmup:right', '2:working:left', '2:working:right']);
  });
});
