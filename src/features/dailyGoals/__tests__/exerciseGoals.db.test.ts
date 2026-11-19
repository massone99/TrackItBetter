import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { deleteExerciseWithHistory, transferExerciseHistory } from '../../exercises/lifecycle';
import { addExerciseToWorkout, completeSet, startWorkout } from '../../session/repository';
import { getExerciseGoals, goalsOf } from '../repository';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
const { mockReal: real } = jest.requireMock('../../../db/client');

const day = goalsOf('day');
const week = goalsOf('week');

/** A completed hold of `seconds` on a timed exercise, done `daysAgo` days ago at noon. */
async function hold(exerciseId: string, seconds: number, daysAgo = 0): Promise<string> {
  const workoutId = await startWorkout('Holds');
  const entryId = await addExerciseToWorkout(workoutId, exerciseId, false);
  const { id: setId } = real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ?').get(entryId) as { id: string };
  await completeSet(setId);
  const at = new Date();
  at.setDate(at.getDate() - daysAgo);
  at.setHours(12, 0, 0, 0);
  real.sqlite.prepare('UPDATE training_set SET completed_at = ?, duration_sec = ? WHERE id = ?').run(at.getTime(), seconds, setId);
  return workoutId;
}

beforeAll(async () => {
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
});
beforeEach(async () => {
  real.sqlite.exec('DELETE FROM training_set; DELETE FROM exercise_entry; DELETE FROM workout;');
  for (const store of [day, week]) for (const goal of await store.list()) await store.remove(goal.id);
});

describe('time goals on one exercise', () => {
  it('count the seconds of that exercise only, over sets and workouts, with its name', async () => {
    await day.put({ scope: 'exercise', key: 'plank', measure: 'minutes', target: 120 });
    await hold('plank', 45);
    await hold('plank', 30);
    await hold('hollow-body-hold', 60);
    const [progress] = (await day.snapshot()).progress;
    expect(progress.done).toBe(75);
    expect(progress.reached).toBe(false);
    expect(progress.goal.label).toBe('Plank');
    expect(progress.contributions.map((item) => item.exerciseId)).toEqual(['plank', 'plank']);
  });

  it('are never stored with the name, and only exist as time goals', async () => {
    const saved = await day.put({ scope: 'exercise', key: 'plank', measure: 'minutes', target: 60, label: 'Plank' });
    expect(saved.label).toBe('Plank');
    const raw = real.sqlite.prepare("SELECT value FROM settings WHERE key = 'daily_goals'").get() as { value: string };
    expect(JSON.parse(raw.value)[0]).not.toHaveProperty('label');
    await expect(day.put({ scope: 'exercise', key: 'plank', measure: 'reps', target: 10 })).rejects.toThrow(RangeError);
  });

  it('give the day and the week of an exercise, the week counting earlier days too', async () => {
    await day.put({ scope: 'exercise', key: 'plank', measure: 'minutes', target: 60 });
    await week.put({ scope: 'exercise', key: 'plank', measure: 'minutes', target: 600 });
    await day.put({ scope: 'exercise', key: 'dead-hang', measure: 'minutes', target: 30 });
    await hold('plank', 40);
    // Monday of this week, at noon: part of the week; counts for today only when today is Monday.
    const sinceMonday = (new Date().getDay() + 6) % 7;
    await hold('plank', 100, sinceMonday);
    const goals = await getExerciseGoals(['plank', 'push-up']);
    expect([...goals.keys()]).toEqual(['plank']);
    expect(goals.get('plank')!.day!.done).toBe(sinceMonday === 0 ? 140 : 40);
    expect(goals.get('plank')!.week!.done).toBe(140);
  });

  it('read nothing when none of the asked exercises has a goal', async () => {
    await day.put({ scope: 'exercise', key: 'plank', measure: 'minutes', target: 60 });
    expect((await getExerciseGoals(['push-up'])).size).toBe(0);
    expect((await getExerciseGoals([])).size).toBe(0);
  });

  it('are removed with the exercise, and move to the exercise that takes its history', async () => {
    await day.put({ scope: 'exercise', key: 'side-plank', measure: 'minutes', target: 60 });
    await week.put({ scope: 'exercise', key: 'side-plank', measure: 'minutes', target: 300 });
    await day.put({ scope: 'exercise', key: 'dead-hang', measure: 'minutes', target: 60 });
    await transferExerciseHistory('side-plank', 'plank', { deleteSource: true });
    expect((await day.list()).map((goal) => goal.key).sort()).toEqual(['dead-hang', 'plank']);
    expect((await week.list()).map((goal) => goal.key)).toEqual(['plank']);
    await deleteExerciseWithHistory('plank');
    expect((await day.list()).map((goal) => goal.key)).toEqual(['dead-hang']);
    expect(await week.list()).toEqual([]);
  });

  it('keep the target exercise\'s own goal when history is moved onto it', async () => {
    await day.put({ scope: 'exercise', key: 'hollow-body-hold', measure: 'minutes', target: 90 });
    await day.put({ scope: 'exercise', key: 'dead-hang', measure: 'minutes', target: 30 });
    await transferExerciseHistory('dead-hang', 'hollow-body-hold', { deleteSource: true });
    expect((await day.list()).map((goal) => [goal.key, goal.target])).toEqual([['hollow-body-hold', 90]]);
  });
});
