import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { listExercises } from '../../exercises/repository';
import { listMobilityRoutines } from '../../mobility/routines';
import { listUserPrograms } from '../../programs/userPrograms';
import { importJson } from '../importJson';
import example from '../../../../docs/import-examples/tom-merrick-full-body-mobility.json';
import merrickProgram from '../../../../docs/import-examples/tom-merrick-full-body-mobility-program.json';

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

describe('importJson', () => {
  it('creates the movements and the routine, and a second import reuses the movements', async () => {
    const first = await importJson(JSON.stringify(example));
    expect(first).toEqual({ exercisesCreated: 14, routines: 1, programs: 0, imagesAdded: 0 });
    const [routine] = await listMobilityRoutines();
    expect(routine.name).toBe('Tom Merrick - 15 Minute Full Body Mobility');
    expect(routine.steps).toHaveLength(15);
    const created = (await listExercises()).filter((item) => item.name === 'Cossack Squats');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ category: 'mobility', metric: 'reps', unilateral: true, isCustom: true });
    expect(routine.steps.find((step) => step.exerciseId === created[0].id)).toMatchObject({ mode: 'reps', reps: 5, perSide: true });
    const second = await importJson(JSON.stringify(example));
    expect(second.exercisesCreated).toBe(0);
    expect(await listMobilityRoutines()).toHaveLength(2);
  });

  it('imports a program of existing movements, not only mobility', async () => {
    const file = { format: 'trackitbetter-import', version: 1, programs: [{ name: 'Pull day', sessions: [{ name: 'A', exercises: [{ exercise: 'pull-up', sets: 3, target: 6, restSeconds: 120 }] }] }] };
    expect(await importJson(JSON.stringify(file))).toEqual({ exercisesCreated: 0, routines: 0, programs: 1, imagesAdded: 0 });
    const [program] = await listUserPrograms();
    expect(program.sessions[0].exercises[0]).toMatchObject({ exerciseId: 'pull-up', sets: 3, target: 6, restSeconds: 120 });
  });

  it('imports the Tom Merrick workout as a program, with holds in seconds and one-sided movements', async () => {
    const result = await importJson(JSON.stringify(merrickProgram));
    expect(result.programs).toBe(1);
    const program = (await listUserPrograms()).find((item) => item.name === 'Tom Merrick - Full Body Mobility')!;
    const [session] = program.sessions;
    expect(session.exercises).toHaveLength(15);
    const names = new Map((await listExercises()).map((item) => [item.id, item]));
    const butcher = session.exercises.find((item) => names.get(item.exerciseId)?.name.startsWith('Prone or Kneeling'))!;
    expect(butcher).toMatchObject({ sets: 1, target: 30 });
    expect(names.get(butcher.exerciseId)?.metric).toBe('time');
    const cossack = session.exercises.find((item) => names.get(item.exerciseId)?.name === 'Cossack Squats')!;
    expect(names.get(cossack.exerciseId)).toMatchObject({ unilateral: true, metric: 'reps' });
  });
});
