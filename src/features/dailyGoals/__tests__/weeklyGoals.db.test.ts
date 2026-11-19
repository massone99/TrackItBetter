import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { addExerciseToWorkout, completeSet, startWorkout } from '../../session/repository';
import { addWeeklyGoalsFromDaily, goalsOf } from '../repository';

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

  it('are derived from the daily goals, then edited freely, and deriving again changes nothing', async () => {
    const day = goalsOf('day');
    const week = goalsOf('week');
    for (const goal of await week.list()) await week.remove(goal.id);
    const [a] = await day.list();
    await day.put({ scope: 'tag', key: 'Hip flexion', measure: 'minutes', target: 600 });
    const first = await addWeeklyGoalsFromDaily(5);
    expect(first.add.length).toBe((await day.list()).length);
    const derived = (await week.list()).find((goal) => goal.key === 'Hip flexion')!;
    expect(derived.target).toBe(3000);
    await week.put({ ...derived, target: 2400 });
    const again = await addWeeklyGoalsFromDaily(7);
    expect(again.add).toEqual([]);
    expect((await week.list()).find((goal) => goal.id === derived.id)!.target).toBe(2400);
    expect(a).toBeDefined();
  });

  it('counts only completed working seconds of the selected exercise in each period', async () => {
    const now = new Date(2026, 10, 18, 15);
    const day = goalsOf('day');
    const week = goalsOf('week');
    const target = { scope: 'exercise', key: 'tuck-planche', measure: 'minutes', target: 60 } as const;
    const daily = await day.put(target);
    const weekly = await week.put({ ...target, target: 120 });
    await expect(day.put({ ...target, measure: 'reps' })).rejects.toThrow(RangeError);
    const workoutId = await startWorkout('Holds');
    const entryId = await addExerciseToWorkout(workoutId, target.key, false);
    const otherId = await addExerciseToWorkout(workoutId, 'advanced-tuck-planche', false);
    const { id: setId } = real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ?').get(entryId) as { id: string };
    const update = real.sqlite.prepare('UPDATE training_set SET completed_at = ?, duration_sec = ? WHERE entry_id = ?');
    update.run(now.getTime(), 45, entryId);
    update.run(now.getTime(), 90, otherId);
    expect((await day.snapshot(now)).progress.find(({ goal }) => goal.id === daily.id))
      .toMatchObject({ done: 45, goal: { exerciseName: 'Tuck Planche' } });
    update.run(new Date(2026, 10, 16, 15).getTime(), 45, entryId);
    expect((await day.snapshot(now)).progress.find(({ goal }) => goal.id === daily.id)?.done).toBe(0);
    expect((await week.snapshot(now)).progress.find(({ goal }) => goal.id === weekly.id)?.done).toBe(45);
    real.sqlite.prepare("UPDATE training_set SET kind = 'warmup' WHERE id = ?").run(setId);
    expect((await week.snapshot(now)).progress.find(({ goal }) => goal.id === weekly.id)?.done).toBe(0);
  });
});
