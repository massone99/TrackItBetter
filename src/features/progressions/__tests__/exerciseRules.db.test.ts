import { migrateDatabase } from '../../../db/migrations';
import { DEFAULT_EXERCISE_RULE } from '../../../domain/progressionMethods';
import { clearExerciseRule, getAllExerciseRules, getExerciseRule, saveExerciseRule } from '../exerciseRules';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});

const { mockReal: real } = jest.requireMock('../../../db/client');

beforeAll(async () => {
  await migrateDatabase(real.expo);
});

describe('exercise progression rules storage', () => {
  it('defaults to automatic, saves custom methods with parameters, and clears back to automatic', async () => {
    expect(await getExerciseRule('pull-up')).toEqual(DEFAULT_EXERCISE_RULE);

    await saveExerciseRule('pull-up', {
      method: 'last_set_failure',
      lastSetMargin: 2,
      repStep: 1,
      minForm: 4,
      maxRpe: 8.5,
      note: 'chest to bar',
    });
    await saveExerciseRule('tuck-front-lever', {
      method: 'density',
      restStepSec: 15,
      minRestSec: 60,
    });

    expect(await getExerciseRule('pull-up')).toEqual({
      method: 'last_set_failure',
      lastSetMargin: 2,
      repStep: 1,
      minForm: 4,
      maxRpe: 8.5,
      note: 'chest to bar',
    });
    const all = await getAllExerciseRules();
    expect(all.size).toBe(2);
    expect(all.get('tuck-front-lever')).toEqual({ method: 'density', restStepSec: 15, minRestSec: 60 });

    await clearExerciseRule('pull-up');
    expect(await getExerciseRule('pull-up')).toEqual(DEFAULT_EXERCISE_RULE);
    expect((await getAllExerciseRules()).has('pull-up')).toBe(false);
  });
});
