import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { getSessionRecords } from '../../analytics/repository';
import { updateExercise } from '../../exercises/customRepository';
import { addExerciseToWorkout, addSet, getActiveWorkout, getPreviousPerformance, setEntryApparatus, setSetBands, startWorkout, updateSet } from '../../session/repository';
import { addApparatus, getEquipment, newBand, saveBandSet } from '../repository';
import { bandsById } from '../useEquipment';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
const { mockReal: real } = jest.requireMock('../../../db/client');

const finish = (workoutId: string, at: number) => {
  real.sqlite.prepare('UPDATE training_set SET completed_at = ? WHERE entry_id IN (SELECT id FROM exercise_entry WHERE workout_id = ?)').run(at, workoutId);
  real.sqlite.prepare('UPDATE workout SET started_at = ?, ended_at = ? WHERE id = ?').run(at, at + 1, workoutId);
};

/** A finished workout of one front lever set of `seconds`, on `apparatusId` (null: the exercise default). */
async function logFrontLever(seconds: number, apparatusId: string | null, at: number) {
  const workoutId = await startWorkout('FL');
  const entryId = await addExerciseToWorkout(workoutId, 'front-lever');
  if (apparatusId) await setEntryApparatus(entryId, apparatusId);
  const { id } = real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ?').get(entryId) as { id: string };
  await updateSet(id, 'durationSec', seconds);
  finish(workoutId, at);
  return workoutId;
}

beforeAll(async () => {
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
  if (!real.sqlite.prepare("SELECT id FROM exercise WHERE id = 'front-lever'").get()) {
    real.sqlite.prepare("INSERT INTO exercise (id, name, metric, category, created_at) VALUES ('front-lever', 'Front Lever', 'time', 'skill', 0)").run();
  }
});

describe('equipment', () => {
  it('starts with the built-in apparatus and keeps new ones global', async () => {
    const before = await getEquipment();
    expect(before.apparatus.map((item) => item.builtin)).toContain('rings');
    const box = await addApparatus('Box');
    expect((await getEquipment()).apparatus.find((item) => item.id === box.id)?.name).toBe('Box');
  });

  it('compares an exercise only with sessions on the same apparatus when it changes the difficulty', async () => {
    const exercise = real.sqlite.prepare("SELECT * FROM exercise WHERE id = 'front-lever'").get() as Record<string, unknown>;
    await updateExercise('front-lever', {
      name: String(exercise.name), metric: 'time', category: 'skill', equipment: [], cues: [],
      apparatus: { ids: ['builtin-bar', 'builtin-rings'], defaultId: 'builtin-bar', affectsDifficulty: true },
    });
    await logFrontLever(8, null, 1_000); // default: bar
    await logFrontLever(4, 'builtin-rings', 2_000);
    const workoutId = await startWorkout('Today');
    const entryId = await addExerciseToWorkout(workoutId, 'front-lever');
    await setEntryApparatus(entryId, 'builtin-bar');
    const onBar = await getPreviousPerformance(['front-lever'], workoutId, new Map([['front-lever', 'builtin-bar']]));
    expect(onBar.get('front-lever')?.sets[0].durationSec).toBe(8);
    const onRings = await getPreviousPerformance(['front-lever'], workoutId, new Map([['front-lever', 'builtin-rings']]));
    expect(onRings.get('front-lever')?.sets[0].durationSec).toBe(4);
    const nowhere = await getPreviousPerformance(['front-lever'], workoutId, new Map([['front-lever', 'parallettes']]));
    expect(nowhere.get('front-lever')).toBeUndefined();
    // Without the apparatus the latest session counts, whatever it was done on.
    expect((await getPreviousPerformance(['front-lever'], workoutId)).get('front-lever')?.sets[0].durationSec).toBe(4);

    // 6 s on the bar is no record (8 s there before), even though it beats the rings.
    const { id } = real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ?').get(entryId) as { id: string };
    await updateSet(id, 'durationSec', 6);
    real.sqlite.prepare('UPDATE training_set SET completed_at = 3000 WHERE id = ?').run(id);
    expect((await getSessionRecords(workoutId)).sets).toEqual([]);
    real.sqlite.prepare('DELETE FROM workout WHERE id = ?').run(workoutId);
  });

  it('saves the bands of a set with their assistance, and a new set starts with the same bands', async () => {
    const set = await saveBandSet({ name: 'Decathlon', bands: [{ ...newBand('Blue', '#2F80ED'), minKg: 15, maxKg: 35 }, newBand('Green', '#27AE60')] });
    const byId = bandsById(await getEquipment());
    const [blue, green] = set.bands;
    const workoutId = await startWorkout('Bands');
    const entryId = await addExerciseToWorkout(workoutId, 'pull-up');
    const { id } = real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ?').get(entryId) as { id: string };
    await setSetBands(id, [{ bandId: blue.id, tension: 3 }], byId);
    await addSet(entryId);
    let sets = (await getActiveWorkout(workoutId))!.exercises[0].sets;
    expect(sets.map((item) => item.assistKg)).toEqual([35, 35]);
    expect(sets[1].bands).toEqual([{ bandId: blue.id, tension: 3 }]);
    // A band without kg makes the assistance unknown.
    await setSetBands(id, [{ bandId: blue.id, tension: 1 }, { bandId: green.id, tension: 2 }], byId);
    sets = (await getActiveWorkout(workoutId))!.exercises[0].sets;
    expect(sets[0].assistKg).toBeNull();
    expect(sets[0].bands).toHaveLength(2);
    real.sqlite.prepare('DELETE FROM workout WHERE id = ?').run(workoutId);
  });

  it('puts the bands on both sides of an L/R pair', async () => {
    const set = await saveBandSet({ name: 'Pair bands', bands: [{ ...newBand('Red', '#EB5757'), minKg: 10, maxKg: 10 }] });
    const byId = bandsById(await getEquipment());
    const workoutId = await startWorkout('Pair');
    const entryId = await addExerciseToWorkout(workoutId, 'pull-up');
    const side = { reps: 5, durationSec: null, distanceM: null, addedLoadKg: 0, rpe: null };
    const pairSet = await addSet(entryId, { left: side, right: side });
    await setSetBands(pairSet, [{ bandId: set.bands[0].id, tension: 1 }], byId);
    const rows = real.sqlite.prepare('SELECT side, assist_kg FROM training_set WHERE pair_id IS NOT NULL AND entry_id = ?').all(entryId) as { side: string; assist_kg: number }[];
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.assist_kg === 10)).toBe(true);
    real.sqlite.prepare('DELETE FROM workout WHERE id = ?').run(workoutId);
  });
});
