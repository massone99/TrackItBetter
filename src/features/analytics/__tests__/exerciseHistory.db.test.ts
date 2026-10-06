import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { getExerciseHistory, getExerciseHistoryOverview, getExerciseRepsAtLoad } from '../repository';
import { repsAtLoadFromHistory } from '../repsAtLoad';

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
  const now = Date.now();
  real.sqlite.exec(`
    INSERT INTO workout (id, name, started_at, ended_at) VALUES
      ('w1', 'A', ${now - 3 * day}, ${now - 3 * day + 3_600_000}),
      ('w2', 'B', ${now - 2 * day}, ${now - 2 * day + 3_600_000}),
      ('w3', 'C', ${now - day}, ${now - day + 3_600_000}),
      ('live', 'Live', ${now}, NULL);
    INSERT INTO exercise_entry (id, workout_id, exercise_id, "order") VALUES
      ('e1', 'w1', 'pull-up', 1), ('e2', 'w2', 'pull-up', 1), ('e3', 'w3', 'pull-up', 1), ('e4', 'live', 'pull-up', 1);
    INSERT INTO training_set (id, entry_id, set_index, kind, reps, added_load_kg, side, completed_at) VALUES
      ('s1', 'e1', 1, 'working', 5, 0, 'both', ${now - 3 * day}),
      ('s2', 'e2', 1, 'working', 6, 0, 'both', ${now - 2 * day}),
      ('s3', 'e2', 2, 'working', 4, 10, 'both', ${now - 2 * day + 1000}),
      ('s4', 'e3', 1, 'working', 7, 0, 'both', ${now - day}),
      ('s5', 'e4', 1, 'working', 9, 0, 'both', ${now});
  `);
});

describe('exercise page history', () => {
  it('reads only the latest sessions when limited', async () => {
    expect((await getExerciseHistory('pull-up', 2)).map((session) => session.workoutId)).toEqual(['w3', 'w2']);
    expect(await getExerciseHistory('pull-up')).toHaveLength(3);
  });

  it('counts sessions and how sets were logged without loading them', async () => {
    expect(await getExerciseHistoryOverview('pull-up')).toEqual({ sessions: 3, sided: false, sideless: true });
    expect(await getExerciseHistoryOverview('push-up')).toEqual({ sessions: 0, sided: false, sideless: false });
  });

  it('builds reps at load like the full history did', async () => {
    expect(await getExerciseRepsAtLoad('pull-up')).toEqual(repsAtLoadFromHistory(await getExerciseHistory('pull-up')));
  });
});
