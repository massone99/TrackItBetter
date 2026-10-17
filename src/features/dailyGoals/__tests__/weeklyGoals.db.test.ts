import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { addExerciseToWorkout, completeSet, startWorkout } from '../../session/repository';
import { goalsOf } from '../repository';

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

describe('weekly goals', () => {
  it('are stored apart from the daily ones, with their own ceiling', async () => {
    const day = goalsOf('day');
    const week = goalsOf('week');
    await week.put({ scope: 'category', key: 'push', measure: 'reps', target: 30000 });
    await expect(day.put({ scope: 'category', key: 'push', measure: 'reps', target: 30000 })).rejects.toThrow(RangeError);
    expect(await day.list()).toEqual([]);
    expect(await week.list()).toHaveLength(1);
  });

  it('count sets of the whole week, while the day only counts today', async () => {
    const day = goalsOf('day');
    const week = goalsOf('week');
    const [goal] = await week.list();
    await week.put({ ...goal, target: 100 });
    await day.put({ scope: 'category', key: 'push', measure: 'reps', target: 100 });
    const workoutId = await startWorkout('Push');
    const entryId = await addExerciseToWorkout(workoutId, 'push-up', false);
    const { id: setId } = real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ?').get(entryId) as { id: string };
    await completeSet(setId);
    // The same set, moved to Monday of this week at noon, still counts for the week; to last week, no.
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    monday.setHours(12, 0, 0, 0);
    real.sqlite.prepare('UPDATE training_set SET completed_at = ?, reps = 10 WHERE id = ?').run(monday.getTime(), setId);
    expect((await week.snapshot()).progress[0].done).toBe(10);
    const today = new Date();
    expect((await day.snapshot()).progress[0].done).toBe(today.getDay() === 1 ? 10 : 0);
    real.sqlite.prepare('UPDATE training_set SET completed_at = ? WHERE id = ?').run(monday.getTime() - 7 * 86400000, setId);
    expect((await week.snapshot()).progress[0].done).toBe(0);
  });
});
