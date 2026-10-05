import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { createRealDatabase } from '../../../test/realDatabase';
import { exerciseEntries } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { getProgressSnapshot, getTrainingStatsRows } from '../../analytics/repository';
import { createCustomExercise } from '../../exercises/customRepository';
import { logMicroSession } from '../microSession';
import { startUserProgramSession } from '../../programs/startUserSession';
import {
  addExerciseToWorkout,
  addSet,
  completeSet,
  finishWorkout,
  getActiveWorkout,
  getCompletedWorkout,
  listRecentWorkouts,
  logCompletedWorkout,
  removeSetWithUndo,
  repeatWorkout,
  restoreRemoved,
  saveCompletedPair,
  setUnilateralRest,
  setSetKind,
  startWorkout,
  updateSet,
  updateSetNote,
} from '../repository';

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

beforeEach(() => {
  real.sqlite.prepare('DELETE FROM workout').run();
});

const pairRows = (entryId: string) => real.sqlite.prepare(
  'SELECT id, pair_id, side, kind, reps, added_load_kg, rpe, note, completed_at FROM training_set WHERE entry_id = ? ORDER BY set_index, side',
).all(entryId) as Record<string, unknown>[];

const buildUnilateral = async (name = 'Unilateral') => {
  const workoutId = await startWorkout(name);
  const entryId = await addExerciseToWorkout(workoutId, 'reverse-lunge');
  return { workoutId, entryId };
};

describe('unilateral session persistence', () => {
  it('rejects invalid side values while retaining signed assistance', async () => {
    const { entryId } = await buildUnilateral();
    const [left] = pairRows(entryId);
    await expect(updateSet(left.id as string, 'reps', 1.5)).rejects.toThrow();
    await expect(updateSet(left.id as string, 'durationSec', -1)).rejects.toThrow();
    await expect(updateSet(left.id as string, 'addedLoadKg', Number.NaN)).rejects.toThrow();
    await updateSet(left.id as string, 'addedLoadKg', -10);
    expect(pairRows(entryId)[0].added_load_kg).toBe(-10);
  });

  it('numbers automatic unilateral sets by pair rather than by side', async () => {
    const workoutId = await logCompletedWorkout({
      name: 'Automatic pairs', startedAt: new Date(1), endedAt: new Date(2),
      entries: [{ exerciseId: 'reverse-lunge', sets: [
        { reps: 8, completedAt: new Date(2) },
        { reps: 10, completedAt: new Date(2) },
      ] }],
    });
    expect((await getCompletedWorkout(workoutId))!.exercises[0].sets.map((set) => set.index)).toEqual([1, 1, 2, 2]);
  });

  it('creates linked L/R rows, keeps values independent, blocks a half-completed finish, then completes the draft', async () => {
    const { workoutId, entryId } = await buildUnilateral();
    const [left, right] = pairRows(entryId);
    expect(left).toMatchObject({ side: 'left', pair_id: right.pair_id, completed_at: null });
    expect(right).toMatchObject({ side: 'right', pair_id: left.pair_id, completed_at: null });

    await updateSet(left.id as string, 'reps', 10);
    await updateSet(right.id as string, 'reps', 8);
    await updateSet(left.id as string, 'addedLoadKg', 20);
    await updateSet(right.id as string, 'addedLoadKg', 15);
    await completeSet(left.id as string);
    await expect(finishWorkout(workoutId)).rejects.toThrow(/Serie 1.*Destro/i);
    expect(await getActiveWorkout(workoutId)).not.toBeNull();

    await completeSet(right.id as string);
    await finishWorkout(workoutId);
    expect(await getActiveWorkout(workoutId)).toBeNull();
    const finished = await getCompletedWorkout(workoutId);
    expect(finished?.exercises[0].sets.map(({ side, reps, addedLoadKg, completedAt }) => ({ side, reps, addedLoadKg, done: completedAt !== null }))).toEqual([
      { side: 'left', reps: 10, addedLoadKg: 20, done: true },
      { side: 'right', reps: 8, addedLoadKg: 15, done: true },
    ]);
  });

  it('changes warm-up/work kind and removes/restores a complete pair with stable ids', async () => {
    const { entryId } = await buildUnilateral('Pair operations');
    const [left, right] = pairRows(entryId);
    real.sqlite.prepare('INSERT INTO form_check_video (id, file_name, workout_id, exercise_id, set_id, duration_ms, file_size, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('pair-video-left', 'pair-left.mp4', (real.sqlite.prepare('SELECT workout_id FROM exercise_entry WHERE id = ?').get(entryId) as { workout_id: string }).workout_id, 'reverse-lunge', left.id, 1200, 42, 2);
    real.sqlite.prepare('INSERT INTO form_check_video (id, file_name, workout_id, exercise_id, set_id, duration_ms, file_size, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('pair-video-right', 'pair-right.mp4', (real.sqlite.prepare('SELECT workout_id FROM exercise_entry WHERE id = ?').get(entryId) as { workout_id: string }).workout_id, 'reverse-lunge', right.id, 1300, 43, 3);
    await setSetKind(left.id as string, 'warmup');
    expect(pairRows(entryId).map((row) => row.kind)).toEqual(['warmup', 'warmup']);
    await setSetKind(right.id as string, 'working');
    expect(pairRows(entryId).map((row) => row.kind)).toEqual(['working', 'working']);

    const removed = await removeSetWithUndo(left.id as string);
    expect(removed?.sets.map((row) => row.id).sort()).toEqual([left.id, right.id].sort());
    expect(removed?.videos?.map(({ id, setId, durationMs, fileSize }) => ({ id, setId, durationMs, fileSize }))).toEqual([
      { id: 'pair-video-left', setId: left.id, durationMs: 1200, fileSize: 42 },
      { id: 'pair-video-right', setId: right.id, durationMs: 1300, fileSize: 43 },
    ]);
    expect(pairRows(entryId)).toEqual([]);
    await restoreRemoved(removed!);
    expect(pairRows(entryId).map((row) => ({ id: row.id, pair_id: row.pair_id, side: row.side }))).toEqual([
      { id: left.id, pair_id: left.pair_id, side: 'left' },
      { id: right.id, pair_id: right.pair_id, side: 'right' },
    ]);
    expect(real.sqlite.prepare('SELECT id, set_id, duration_ms, file_size FROM form_check_video WHERE id LIKE ? ORDER BY id').all('pair-video-%')).toEqual([
      { id: 'pair-video-left', set_id: left.id, duration_ms: 1200, file_size: 42 },
      { id: 'pair-video-right', set_id: right.id, duration_ms: 1300, file_size: 43 },
    ]);
  });

  it('repeats a completed pair with a new pair identity and open sides', async () => {
    const { workoutId, entryId } = await buildUnilateral('Repeat pair');
    const [left, right] = pairRows(entryId);
    await updateSet(left.id as string, 'reps', 11);
    await updateSet(right.id as string, 'reps', 9);
    await completeSet(left.id as string);
    await completeSet(right.id as string);
    await finishWorkout(workoutId);

    const repeatedId = await repeatWorkout(workoutId);
    const repeated = await getActiveWorkout(repeatedId);
    const repeatedSets = repeated?.exercises[0].sets ?? [];
    expect(repeatedSets).toHaveLength(2);
    expect(repeatedSets.map(({ side, reps, pairId, completedAt, id }) => ({ side, reps, pairId, completedAt, id }))).toEqual(expect.arrayContaining([
      expect.objectContaining({ side: 'left', reps: 11, completedAt: null }),
      expect.objectContaining({ side: 'right', reps: 9, completedAt: null }),
    ]));
    expect(new Set(repeatedSets.map(({ pairId }) => pairId)).size).toBe(1);
    expect(repeatedSets[0].pairId).not.toBe(left.pair_id);
    expect(repeatedSets.map(({ id }) => id)).not.toEqual(expect.arrayContaining([left.id, right.id]));
  });

  it('converts one finished legacy row atomically, preserving its note and video attachment', async () => {
    const workoutId = await startWorkout('Convert history');
    const entryId = await addExerciseToWorkout(workoutId, 'push-up');
    const [{ id: originalId }] = real.sqlite.prepare('SELECT id FROM training_set WHERE entry_id = ?').all(entryId) as { id: string }[];
    await updateSet(originalId, 'reps', 12);
    await updateSetNote(originalId, 'Original side note');
    await completeSet(originalId);
    real.sqlite.prepare('INSERT INTO form_check_video (id, file_name, workout_id, exercise_id, set_id, duration_ms, file_size, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('video-1', 'video-1.mp4', workoutId, 'push-up', originalId, 1000, 12, 1);
    await finishWorkout(workoutId);

    await saveCompletedPair(workoutId, originalId, 'right',
      { reps: 9, durationSec: null, distanceM: null, addedLoadKg: 0, rpe: null },
      { reps: 7, durationSec: null, distanceM: null, addedLoadKg: 0, rpe: null });

    const rows = real.sqlite.prepare('SELECT id, pair_id, side, reps, note, completed_at FROM training_set WHERE entry_id = ? ORDER BY side').all(entryId) as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    const original = rows.find((row) => row.id === originalId);
    const created = rows.find((row) => row.id !== originalId);
    expect(original).toMatchObject({ side: 'right', reps: 7, note: 'Original side note' });
    expect(created).toMatchObject({ side: 'left', reps: 9, note: null });
    expect(original?.pair_id).toBe(created?.pair_id);
    expect(real.sqlite.prepare('SELECT set_id FROM form_check_video WHERE id = ?').get('video-1')).toEqual({ set_id: originalId });
  });
});

describe('unilateral integration paths', () => {
  it('explicitly links two legacy side rows without replacing their ids or notes', async () => {
    const workoutId = await startWorkout('Legacy sides');
    const entryId = await addExerciseToWorkout(workoutId, 'push-up');
    const rightId = await addSet(entryId);
    const leftId = pairRows(entryId).find((s) => s.id !== rightId)!.id as string;
    real.sqlite.prepare("UPDATE training_set SET side = 'left' WHERE id = ?").run(leftId);
    real.sqlite.prepare("UPDATE training_set SET side = 'right' WHERE id = ?").run(rightId);
    await updateSetNote(leftId, 'L note'); await updateSetNote(rightId, 'R note');
    await completeSet(leftId); await completeSet(rightId); await finishWorkout(workoutId);
    expect((await listRecentWorkouts()).find((w) => w.id === workoutId)?.setCount).toBe(2);
    const values = { reps: 8, durationSec: null, distanceM: null, addedLoadKg: 0, rpe: null };
    await saveCompletedPair(workoutId, leftId, 'left', values, { ...values, reps: 7 }, rightId);
    expect(pairRows(entryId)).toHaveLength(2);
    expect(pairRows(entryId).map((s) => [s.id, s.note])).toEqual([[leftId, 'L note'], [rightId, 'R note']]);
    expect((await listRecentWorkouts()).find((w) => w.id === workoutId)?.setCount).toBe(1);
  });
  it('supports habitual rest plus a per-workout override, and keeps it on repeat', async () => {
    const { workoutId, entryId } = await buildUnilateral('Rest preference');
    await setUnilateralRest(entryId, 'side', true);
    expect(real.sqlite.prepare('SELECT unilateral_rest_mode FROM exercise WHERE id = ?').get('reverse-lunge')).toEqual({ unilateral_rest_mode: 'side' });
    expect(real.sqlite.prepare('SELECT unilateral_rest_mode FROM exercise_entry WHERE id = ?').get(entryId)).toEqual({ unilateral_rest_mode: null });
    await setUnilateralRest(entryId, 'pair');
    expect(real.sqlite.prepare('SELECT unilateral_rest_mode FROM exercise_entry WHERE id = ?').get(entryId)).toEqual({ unilateral_rest_mode: 'pair' });

    for (const row of pairRows(entryId)) await completeSet(row.id as string);
    await finishWorkout(workoutId);
    const repeated = await repeatWorkout(workoutId);
    expect((await getActiveWorkout(repeated))?.exercises[0].unilateralRestOverride).toBe('pair');
  });

  it('allows completing right before left and applies mixed warm-up/work kinds per pair', async () => {
    const { workoutId, entryId } = await buildUnilateral('Right first');
    const first = pairRows(entryId);
    await completeSet(first.find((row) => row.side === 'right')!.id as string);
    await completeSet(first.find((row) => row.side === 'left')!.id as string);
    await setSetKind(first[0].id as string, 'warmup');
    const secondId = await addSet(entryId);
    await setSetKind(secondId, 'working');
    const rows = pairRows(entryId);
    expect(rows.map((row) => row.kind)).toEqual(['warmup', 'warmup', 'working', 'working']);
    for (const row of rows) await completeSet(row.id as string);
    await finishWorkout(workoutId);
    expect((await getCompletedWorkout(workoutId))?.exercises[0].sets).toHaveLength(4);
  });

  it('rejects malformed automatic completed-workout logging without leaving a workout behind', async () => {
    const before = (real.sqlite.prepare('SELECT COUNT(*) AS count FROM workout').get() as { count: number }).count;
    await expect(logCompletedWorkout({
      name: 'Malformed pair',
      startedAt: new Date(1),
      endedAt: new Date(2),
      entries: [{ exerciseId: 'reverse-lunge', sets: [
        { pairId: 'broken', side: 'left', reps: 8, durationSec: null, completedAt: new Date(2) },
        { pairId: 'broken', side: 'left', reps: 8, durationSec: null, completedAt: new Date(2) },
      ] }],
    })).rejects.toThrow(/Invalid unilateral pair/);
    expect((real.sqlite.prepare('SELECT COUNT(*) AS count FROM workout').get() as { count: number }).count).toBe(before);
  });

  it('counts a bilateral micro-session as one completed set', async () => {
    await logMicroSession('reverse-lunge', 5);
    const [workout] = await listRecentWorkouts(1);
    expect(workout.name).toMatch(/^Mini-session/);
    expect(workout.setCount).toBe(1);
  });

  it('builds three linked pairs for a three-set unilateral program prescription', async () => {
    const workoutId = await startUserProgramSession(
      { id: 'program-1', name: 'Program', updatedAt: '', sessions: [] },
      { id: 'session-1', name: 'Legs', exercises: [{ id: 'exercise-1', exerciseId: 'reverse-lunge', sets: 3, target: 8, restSeconds: 60 }] },
    );
    const sets = (await getActiveWorkout(workoutId))!.exercises[0].sets;
    expect(sets).toHaveLength(6);
    expect(new Set(sets.map(({ pairId }) => pairId)).size).toBe(3);
    expect(sets.filter(({ side }) => side === 'left')).toHaveLength(3);
    expect(sets.filter(({ side }) => side === 'right')).toHaveLength(3);
  });

  it('aggregates asymmetric weighted L/R rows in progress and stats queries', async () => {
    const exerciseId = await createCustomExercise({
      unilateral: true,
      name: 'Weighted unilateral test',
      metric: 'reps_load',
      category: 'legs',
      extraCategories: [],
      equipment: [],
      cues: [],
      demoUrl: null,
    });
    const { workoutId, entryId } = await buildUnilateral('Weighted analytics');
    await real.db.update(exerciseEntries).set({ exerciseId }).where(eq(exerciseEntries.id, entryId));
    const rows = pairRows(entryId);
    await updateSet(rows[0].id as string, 'reps', 10);
    await updateSet(rows[1].id as string, 'reps', 8);
    await updateSet(rows[0].id as string, 'addedLoadKg', 20);
    await updateSet(rows[1].id as string, 'addedLoadKg', 15);
    await completeSet(rows[0].id as string);
    await completeSet(rows[1].id as string);
    await finishWorkout(workoutId);
    const statsRows = await getTrainingStatsRows();
    const ours = statsRows.filter((row) => row.workoutId === workoutId);
    expect(ours).toHaveLength(2);
    expect(new Set(ours.map(({ pairId }) => pairId)).size).toBe(1);
    const snapshot = await getProgressSnapshot(new Date(Date.now() + 1000));
    expect(snapshot.completedSets).toBeGreaterThanOrEqual(1);
    expect(snapshot.volume.loadRepsKg).toBeGreaterThanOrEqual(160);
  });
});

describe('schema v9 to v10 migration', () => {
  it('adds unilateral columns and constraints without rewriting legacy rows, and is idempotent', async () => {
    const legacy = createRealDatabase();
    await migrateDatabase(legacy.expo);
    await seedCatalogIfEmpty(legacy.db as unknown as Parameters<typeof seedCatalogIfEmpty>[0]);
    legacy.sqlite.exec(`
      DROP TRIGGER IF EXISTS set_pair_insert;
      DROP INDEX IF EXISTS set_pair_side_idx;
      ALTER TABLE training_set DROP COLUMN target_rpe;
      ALTER TABLE exercise_entry DROP COLUMN form_rating;
      ALTER TABLE exercise DROP COLUMN mobility_mode;
      ALTER TABLE exercise_entry DROP COLUMN block;
      ALTER TABLE exercise DROP COLUMN unilateral_rest_mode;
      ALTER TABLE exercise_entry DROP COLUMN unilateral_rest_mode;
      ALTER TABLE training_set DROP COLUMN pair_id;
      PRAGMA user_version = 9;
      INSERT INTO workout (id, name, started_at, ended_at) VALUES ('legacy-workout', 'Legacy', 10, 20);
      INSERT INTO exercise_entry (id, workout_id, exercise_id, "order") VALUES ('legacy-entry', 'legacy-workout', 'reverse-lunge', 1);
      INSERT INTO training_set (id, entry_id, set_index, kind, reps, added_load_kg, side, completed_at) VALUES ('legacy-set', 'legacy-entry', 1, 'working', 8, 12, 'both', 20);
    `);
    await migrateDatabase(legacy.expo);
    await migrateDatabase(legacy.expo);
    expect(legacy.sqlite.prepare('PRAGMA user_version').get()).toEqual({ user_version: 14 });
    expect(legacy.sqlite.prepare('SELECT side, reps, added_load_kg, pair_id FROM training_set WHERE id = ?').get('legacy-set')).toEqual({ side: 'both', reps: 8, added_load_kg: 12, pair_id: null });
    expect(legacy.sqlite.prepare('SELECT unilateral_rest_mode FROM exercise WHERE id = ?').get('reverse-lunge')).toEqual({ unilateral_rest_mode: 'pair' });
    expect(legacy.sqlite.prepare('SELECT unilateral_rest_mode FROM exercise_entry WHERE id = ?').get('legacy-entry')).toEqual({ unilateral_rest_mode: null });
  });
});
