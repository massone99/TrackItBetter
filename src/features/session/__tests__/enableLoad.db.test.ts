import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { enableExerciseLoad } from '../repository';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
const { mockReal: real } = jest.requireMock('../../../db/client');

const metricOf = (id: string) => (real.sqlite.prepare('SELECT metric FROM exercise WHERE id = ?').get(id) as { metric: string }).metric;
const firstWith = (metric: string) => (real.sqlite.prepare('SELECT id FROM exercise WHERE metric = ? LIMIT 1').get(metric) as { id: string } | undefined)?.id;

beforeAll(async () => {
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
});

describe('enableExerciseLoad', () => {
  it('turns reps into reps_load and time into time_load', async () => {
    const reps = firstWith('reps')!;
    const time = firstWith('time')!;
    expect(await enableExerciseLoad(reps)).toBe(true);
    expect(await enableExerciseLoad(time)).toBe(true);
    expect(metricOf(reps)).toBe('reps_load');
    expect(metricOf(time)).toBe('time_load');
  });

  it('leaves loaded and distance exercises alone', async () => {
    const loaded = firstWith('reps_load')!;
    expect(await enableExerciseLoad(loaded)).toBe(false);
    expect(metricOf(loaded)).toBe('reps_load');
    const distance = firstWith('distance');
    if (distance) {
      expect(await enableExerciseLoad(distance)).toBe(false);
      expect(metricOf(distance)).toBe('distance');
    }
  });
});
