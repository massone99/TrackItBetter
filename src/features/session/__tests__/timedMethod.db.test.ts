import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { addExerciseToWorkout, recordTimedMethod, startWorkout } from '../repository';
import type { TimedMethodPlan } from '../../../domain/timedMethod';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const { drizzle } = jest.requireActual('drizzle-orm/expo-sqlite');
  const real = createRealDatabase();
  // Run the timed method through the same synchronous Drizzle driver as the app.
  const client = {
    prepareSync(sql: string) {
      const statement = real.sqlite.prepare(sql);
      return {
        executeSync: (params: unknown[]) => statement.run(...params),
        executeForRawResultSync: (params: unknown[]) => {
          statement.setReturnArrays(true);
          return { getAllSync: () => statement.all(...params) };
        },
      };
    },
  };
  return { db: drizzle(client), initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));

const { mockReal: real } = jest.requireMock('../../../db/client');

beforeAll(async () => {
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
});

it('reuses an open set and persists each measured hold once across retries', async () => {
  const workoutId = await startWorkout('Timed');
  const entryId = await addExerciseToWorkout(workoutId, 'dead-hang');
  const plan: TimedMethodPlan = {
    workoutId, entryId, countdownSec: 5, startedAt: 1000, blockSec: 60, holdSec: 10, restSec: 10, recoverySec: 0, testSec: 0,
    recoveryEndedAt: null, testStartedAt: null, testEndedAt: null, blockSaved: false,
  };
  const rows = () => real.sqlite.prepare('SELECT id, duration_sec, rest_sec, completed_at FROM training_set WHERE entry_id = ? ORDER BY set_index').all(entryId);
  const initial = rows()[0];
  await recordTimedMethod(plan, 26000, false);
  await recordTimedMethod(plan, 31500, true);
  await recordTimedMethod(plan, 31500, true);

  expect(rows()).toEqual([
    { id: initial.id, duration_sec: 10, rest_sec: 10, completed_at: 16000 },
    { id: expect.any(String), duration_sec: 5, rest_sec: 0, completed_at: 31500 },
  ]);
});

it('keeps checkpoints independent when two plans use the same entry', async () => {
  const workoutId = await startWorkout('Timed');
  const entryId = await addExerciseToWorkout(workoutId, 'dead-hang');
  const first: TimedMethodPlan = {
    workoutId, entryId, countdownSec: 0, startedAt: 1000, blockSec: 30, holdSec: 10, restSec: 0, recoverySec: 0, testSec: 0,
    recoveryEndedAt: null, testStartedAt: null, testEndedAt: null, blockSaved: false,
  };
  const second = { ...first, startedAt: 12000 };
  await recordTimedMethod(first, 11000, true);
  await recordTimedMethod(second, 18000, true);
  await recordTimedMethod(first, 11000, true);

  expect(real.sqlite.prepare('SELECT duration_sec FROM training_set WHERE entry_id = ? ORDER BY set_index').all(entryId))
    .toEqual([{ duration_sec: 10 }, { duration_sec: 6 }]);
});

it('does not mark either side of a prescribed pair from a single timed hold', async () => {
  const workoutId = await startWorkout('Timed');
  const entryId = await addExerciseToWorkout(workoutId, 'dead-hang');
  real.sqlite.prepare('DELETE FROM training_set WHERE entry_id = ?').run(entryId);
  const insert = real.sqlite.prepare("INSERT INTO training_set (id, entry_id, set_index, duration_sec, pair_id, side) VALUES (?, ?, 1, 10, ?, ?)");
  insert.run('left', entryId, 'pair', 'left');
  insert.run('right', entryId, 'pair', 'right');
  const plan: TimedMethodPlan = {
    workoutId, entryId, countdownSec: 0, startedAt: 1000, blockSec: 30, holdSec: 10, restSec: 0, recoverySec: 0, testSec: 0,
    recoveryEndedAt: null, testStartedAt: null, testEndedAt: null, blockSaved: false,
  };
  await recordTimedMethod(plan, 7000, true);

  expect(real.sqlite.prepare('SELECT side, pair_id, completed_at FROM training_set WHERE entry_id = ? ORDER BY set_index').all(entryId)).toEqual([
    { side: 'left', pair_id: 'pair', completed_at: null },
    { side: 'right', pair_id: 'pair', completed_at: null },
    { side: 'both', pair_id: null, completed_at: 7000 },
  ]);
});
