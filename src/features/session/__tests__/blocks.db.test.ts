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
