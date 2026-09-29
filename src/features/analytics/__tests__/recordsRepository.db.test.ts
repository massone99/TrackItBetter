import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { getExerciseRecordSummary, getSessionRecords } from '../repository';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
const { mockReal: real } = jest.requireMock('../../../db/client');

beforeAll(async () => {
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
  const day = 86_400_000;
  real.sqlite.exec(`
    INSERT INTO workout (id, name, started_at, ended_at) VALUES ('old', 'A', ${day}, ${day + 1000}), ('now', 'B', ${2 * day}, NULL);
    INSERT INTO exercise_entry (id, workout_id, exercise_id, "order") VALUES ('e1', 'old', 'pull-up', 1), ('e2', 'now', 'pull-up', 1);
    INSERT INTO training_set (id, entry_id, set_index, kind, reps, added_load_kg, rest_sec, side, completed_at) VALUES
      ('o1', 'e1', 1, 'working', 8, 0, 180, 'both', 1),
      ('o2', 'e1', 2, 'working', 8, 0, 180, 'both', 2),
      ('w1', 'e2', 1, 'warmup', 3, 0, 60, 'both', 3),
      ('n1', 'e2', 2, 'working', 9, 0, 120, 'both', 4),
      ('n2', 'e2', 3, 'working', 8, 0, 120, 'both', 5),
      ('n3', 'e2', 4, 'working', 12, 0, 120, 'both', NULL);
  `);
});

describe('getSessionRecords', () => {
  it('compares the active workout with finished ones, skipping warm-ups and open sets', async () => {
    const { sets, volume } = await getSessionRecords('now');
    expect(sets.map((record) => [record.setId, record.kind, record.value, record.previous])).toEqual([
      ['n1', 'repsAtLoad', 9, 8],
      ['n2', 'shorterRest', 120, 180],
    ]);
    expect(volume).toEqual([{ exerciseId: 'pull-up', value: 17, previous: 16 }]);
  });
});

describe('getExerciseRecordSummary', () => {
  it('uses finished workouts only', async () => {
    expect(await getExerciseRecordSummary('pull-up')).toMatchObject({ bestAmount: 8, bestVolume: 16 });
  });
});
