import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { addExerciseToWorkout, addSet, countEmomRounds, recordEmomRound, setSetKind, startWorkout } from '../repository';

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

const rows = (entryId: string) => real.sqlite
  .prepare('SELECT kind, reps, side, pair_id AS pairId, completed_at AS completedAt FROM training_set WHERE entry_id = ? ORDER BY set_index, side')
  .all(entryId) as { kind: string; reps: number; side: string; pairId: string | null; completedAt: number | null }[];

describe('recordEmomRound', () => {
  it('fills planned sets first, then adds new ones, completing each at the round end', async () => {
    const workoutId = await startWorkout('EMOM');
    const entryId = await addExerciseToWorkout(workoutId, 'push-up');
    await addSet(entryId);
    const since = new Date(1_000);
    await recordEmomRound(entryId, 'reps', 5, new Date(61_000));
    await recordEmomRound(entryId, 'reps', 4, new Date(121_000));
    await recordEmomRound(entryId, 'reps', 5, new Date(181_000));

    expect(rows(entryId).map(({ reps, completedAt }) => [reps, completedAt])).toEqual([[5, 61_000], [4, 121_000], [5, 181_000]]);
    expect(await countEmomRounds(entryId, since)).toBe(3);
    expect(await countEmomRounds(entryId, new Date(150_000))).toBe(1);
  });

  it('skips warm-ups and records a left/right pair as one round for unilateral exercises', async () => {
    const workoutId = await startWorkout('EMOM L/R');
    const entryId = await addExerciseToWorkout(workoutId, 'reverse-lunge');
    const [first] = rows(entryId);
    const warmupId = (real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ? LIMIT 1').get(entryId) as { id: string }).id;
    await setSetKind(warmupId, 'warmup');
    expect(first.pairId).not.toBeNull();

    await recordEmomRound(entryId, 'reps', 6, new Date(65_000));

    const done = rows(entryId).filter((row) => row.completedAt === 65_000);
    expect(done.map(({ kind, reps, side }) => [kind, reps, side])).toEqual([['working', 6, 'left'], ['working', 6, 'right']]);
    expect(await countEmomRounds(entryId, new Date(0))).toBe(1);
  });

  it('never fills a gap left before the last completed set', async () => {
    const workoutId = await startWorkout('EMOM gap');
    const entryId = await addExerciseToWorkout(workoutId, 'push-up');
    await recordEmomRound(entryId, 'reps', 5, new Date(61_000));
    await recordEmomRound(entryId, 'reps', 5, new Date(121_000));
    const firstId = (real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ? ORDER BY set_index LIMIT 1').get(entryId) as { id: string }).id;
    real.sqlite.prepare('UPDATE training_set SET completed_at = NULL, reps = 3 WHERE id = ?').run(firstId);

    await recordEmomRound(entryId, 'reps', 5, new Date(181_000));

    expect(rows(entryId).map(({ reps, completedAt }) => [reps, completedAt])).toEqual([[3, null], [5, 121_000], [5, 181_000]]);
  });

  it('refuses a finished workout', async () => {
    const workoutId = await startWorkout('Done');
    const entryId = await addExerciseToWorkout(workoutId, 'push-up');
    real.sqlite.prepare('UPDATE workout SET ended_at = 1 WHERE id = ?').run(workoutId);
    await expect(recordEmomRound(entryId, 'reps', 5, new Date())).rejects.toThrow();
  });
});
