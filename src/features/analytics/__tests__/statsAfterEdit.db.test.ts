import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { updateExercise, type CreateCustomExerciseInput } from '../../exercises/customRepository';
import { getExploreData } from '../repository';
import { buildBreakdown, buildSeries, matchesScope, scopeOptions } from '../explore';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
const { mockReal: real } = jest.requireMock('../../../db/client');

const planche: Omit<CreateCustomExerciseInput, 'category'> = { name: 'Tuck Planche', metric: 'time', equipment: [], cues: [], demoUrl: null, movementTag: null, movementGroup: 'horizontal-push' };

/** Two finished workouts with tuck planche holds (skill in the catalog) and one with push-ups. */
async function seedHistory() {
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
  const day = 86_400_000;
  const now = Date.now();
  real.sqlite.exec(`
    INSERT INTO workout (id, name, started_at, ended_at) VALUES
      ('w1', 'A', ${now - 2 * day}, ${now - 2 * day + 3_600_000}),
      ('w2', 'B', ${now - day}, ${now - day + 3_600_000});
    INSERT INTO exercise_entry (id, workout_id, exercise_id, "order") VALUES
      ('e1', 'w1', 'tuck-planche', 1), ('e2', 'w1', 'push-up', 2), ('e3', 'w2', 'tuck-planche', 1);
    INSERT INTO training_set (id, entry_id, set_index, kind, duration_sec, reps, added_load_kg, side, completed_at) VALUES
      ('s1', 'e1', 1, 'working', 10, NULL, 0, 'both', ${now - 2 * day}),
      ('s2', 'e1', 2, 'working', 12, NULL, 0, 'both', ${now - 2 * day + 1000}),
      ('s3', 'e2', 1, 'working', NULL, 15, 0, 'both', ${now - 2 * day + 2000}),
      ('s4', 'e3', 1, 'working', 11, NULL, 0, 'both', ${now - day});
  `);
}

const setsIn = async (category: string) => {
  const data = await getExploreData();
  return data.rows.filter((row) => matchesScope(row, { kind: 'all', category })).length;
};

beforeAll(seedHistory);

describe('statistics after editing an exercise that already has logged sets', () => {
  it('starts with the planche sets under skill only', async () => {
    await updateExercise('tuck-planche', { ...planche, category: 'skill', extraCategories: [] });
    expect(await setsIn('skill')).toBe(3);
    expect(await setsIn('push')).toBe(1);
  });

  it('adds the logged sets to push when push becomes an extra category', async () => {
    await updateExercise('tuck-planche', { ...planche, category: 'skill', extraCategories: ['push'] });
    const data = await getExploreData();
    expect(await setsIn('skill')).toBe(3);
    expect(await setsIn('push')).toBe(4);
    const options = scopeOptions(data, { kind: 'all' }, 'category');
    expect(options.find((option) => option.key === 'push')?.sets).toBe(4);
    const bucket = buildSeries(data, { scope: { kind: 'all' }, metric: 'sets', granularity: 'day', page: 0, now: new Date() }).buckets.at(-3)!;
    expect(bucket).toBeDefined();
    const split = buildBreakdown(data, { kind: 'all' }, 'sets', bucket);
    expect(Object.fromEntries(split.map((item) => [item.key, item.value]))).toEqual({ skill: 2, push: 3 });
  });

  it('moves the logged sets when push becomes the main category', async () => {
    await updateExercise('tuck-planche', { ...planche, category: 'push', extraCategories: [] });
    expect(await setsIn('push')).toBe(4);
    expect(await setsIn('skill')).toBe(0);
  });

  it('shows a custom exercise without a catalog pattern under the movement group chosen in the form', async () => {
    const now = Date.now();
    real.sqlite.exec(`
      INSERT INTO exercise (id, name, aliases, metric, category, movement_pattern, primary_muscles, secondary_muscles, equipment, unilateral, cues, is_custom, favourite, archived, created_at)
        VALUES ('lift-off', 'Tuck Planche Lift-off', '[]', 'reps', 'push', NULL, '[]', '[]', '[]', 0, '[]', 1, 0, 0, ${now});
      INSERT INTO exercise_entry (id, workout_id, exercise_id, "order") VALUES ('e9', 'w2', 'lift-off', 2);
      INSERT INTO training_set (id, entry_id, set_index, kind, reps, added_load_kg, side, completed_at) VALUES ('s9', 'e9', 1, 'working', 4, 0, 'both', ${now});
    `);
    const inPattern = async (pattern: string) => (await getExploreData()).rows.filter((row) => matchesScope(row, { kind: 'all', pattern })).map((row) => row.exerciseId);
    expect(await inPattern('horizontal-push')).not.toContain('lift-off');

    await updateExercise('lift-off', { name: 'Tuck Planche Lift-off', metric: 'reps', category: 'push', extraCategories: ['skill'], equipment: [], cues: [], demoUrl: null, movementTag: 'Shoulder flexion', movementGroup: 'horizontal-push' });
    expect(await inPattern('horizontal-push')).toContain('lift-off');

    const data = await getExploreData();
    const split = buildBreakdown(data, { kind: 'all', category: 'push' }, 'sets', { workoutIds: ['w1', 'w2'] });
    expect(split.find((item) => item.key === 'horizontal-push')?.value).toBeGreaterThanOrEqual(1);
    expect(split.find((item) => item.key === '')).toBeUndefined();
  });
});

