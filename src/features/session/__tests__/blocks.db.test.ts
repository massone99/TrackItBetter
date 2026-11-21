import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { createBackup, importBackup } from '../../data/backup';
import {
  addExerciseToWorkout, changeWorkoutGroups, completeSet, finishWorkout, getActiveWorkout, getCompletedWorkout,
  linkWithNext, moveExerciseEntry, repeatWorkout, setEntryBlock, setSupersetRest, startWorkout, updateEntryNote,
  updateSetNote, updateWorkoutNote,
} from '../repository';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
const { mockReal: real } = jest.requireMock('../../../db/client');

beforeAll(async () => { await migrateDatabase(real.expo); await seedCatalogIfEmpty(real.db); });
beforeEach(() => { real.sqlite.prepare('DELETE FROM workout').run(); });

async function build(ids = ['push-up', 'pull-up', 'chin-up', 'parallel-bar-dip']) {
  const workoutId = await startWorkout('W');
  const entries: string[] = [];
  for (const exerciseId of ids) entries.push(await addExerciseToWorkout(workoutId, exerciseId));
  return { workoutId, entries };
}
const view = async (workoutId: string) => (await getActiveWorkout(workoutId))!.exercises.map((exercise) => `${exercise.exerciseId}:${exercise.block}`);

describe('workout blocks', () => {
  it('keeps blocks contiguous: warm-up first, mobility last', async () => {
    const { workoutId, entries } = await build();
    await setEntryBlock(entries[2], 'warmup');
    await setEntryBlock(entries[0], 'mobility');
    expect(await view(workoutId)).toEqual(['chin-up:warmup', 'pull-up:main', 'parallel-bar-dip:main', 'push-up:mobility']);
  });

  it('adds a new exercise at the end of the main work, before mobility', async () => {
    const { workoutId, entries } = await build(['push-up', 'pull-up']);
    await setEntryBlock(entries[1], 'mobility');
    await addExerciseToWorkout(workoutId, 'chin-up');
    expect(await view(workoutId)).toEqual(['push-up:main', 'chin-up:main', 'pull-up:mobility']);
  });

  it('puts a mobility exercise added to a workout of other exercises in the mobility block', async () => {
    const { workoutId } = await build(['push-up', 'pull-up']);
    await addExerciseToWorkout(workoutId, 'pike-stretch');
    expect(await view(workoutId)).toEqual(['push-up:main', 'pull-up:main', 'pike-stretch:mobility']);
    const mobilityOnly = await startWorkout('M');
    await addExerciseToWorkout(mobilityOnly, 'pike-stretch');
    expect(await view(mobilityOnly)).toEqual(['pike-stretch:main']);
  });

  it('gives a dragged exercise the block of the exercise above it', async () => {
    const { workoutId, entries } = await build();
    await setEntryBlock(entries[3], 'mobility');
    await moveExerciseEntry(workoutId, entries[3], 0);
    expect(await view(workoutId)).toEqual(['parallel-bar-dip:main', 'push-up:main', 'pull-up:main', 'chin-up:main']);
    await setEntryBlock(entries[0], 'warmup');
    await moveExerciseEntry(workoutId, entries[2], 1);
    expect(await view(workoutId)).toEqual(['push-up:warmup', 'chin-up:warmup', 'parallel-bar-dip:main', 'pull-up:main']);
  });

  it('takes an exercise out of its superset when its block changes', async () => {
    const { workoutId, entries } = await build();
    await linkWithNext(entries[0]);
    await setEntryBlock(entries[1], 'mobility');
    const groups = (await getActiveWorkout(workoutId))!.exercises.map((exercise) => exercise.groupId);
    expect(groups.every((group) => group === null)).toBe(true);
  });
});

describe('workout group editor', () => {
  it('drops several positions in one move and keeps intervening supersets intact', async () => {
    const { workoutId, entries: [a, b, c, d] } = await build();
    const order = async () => (await getActiveWorkout(workoutId))!.exercises.map((entry) => entry.entryId);
    await changeWorkoutGroups(workoutId, { type: 'dropExercise', id: a, targetId: d });
    expect(await order()).toEqual([b, c, d, a]);
    await linkWithNext(c);
    await changeWorkoutGroups(workoutId, { type: 'dropExercise', id: a, targetId: b });
    expect(await order()).toEqual([b, c, d, a]);
    await changeWorkoutGroups(workoutId, { type: 'dropExercise', id: d, targetId: c });
    expect(await order()).toEqual([b, d, c, a]);
  });

  it('moves and deletes groups without touching the exercises, completed sets, or notes', async () => {
    const { workoutId, entries: [first, second, third, fourth] } = await build();
    await setEntryBlock(first, 'warmup');
    const workout = (await getActiveWorkout(workoutId))!;
    const setId = workout.exercises[0].sets[0].id;
    await completeSet(setId);
    await updateSetNote(setId, ' Set note ');
    await updateEntryNote(first, ' Exercise note ');
    await updateWorkoutNote(workoutId, ' Workout note ');

    await changeWorkoutGroups(workoutId, { type: 'group', name: ' Skill ', entryIds: [third, first] });
    const grouped = (await getActiveWorkout(workoutId))!;
    const group = grouped.groupLayout!.groups.find((group) => group.name === 'Skill')!;
    await changeWorkoutGroups(workoutId, { type: 'moveGroup', id: group.id, offset: -1 });
    await changeWorkoutGroups(workoutId, { type: 'superset', parentId: group.id, name: 'Pair', entryIds: [first, third, second] });
    const paired = (await getActiveWorkout(workoutId))!;
    const pair = paired.groupLayout!.supersets[0];
    expect(paired.exercises.map(({ entryId }) => entryId)).toEqual([first, third, second, fourth]);
    expect(paired.exercises.slice(0, 3).every((entry) => entry.groupId === pair.id)).toBe(true);

    await changeWorkoutGroups(workoutId, { type: 'superset', id: pair.id, parentId: group.id, name: 'Renamed', entryIds: [first, third] });
    await changeWorkoutGroups(workoutId, { type: 'deleteSuperset', id: pair.id });
    await changeWorkoutGroups(workoutId, { type: 'deleteGroup', id: group.id });
    const result = (await getActiveWorkout(workoutId))!;
    expect(result.groupLayout!.supersets).toEqual([]);
    expect(result.groupLayout!.groups.some(({ id }) => id === group.id)).toBe(false);
    expect(result.exercises.map(({ entryId }) => entryId).sort()).toEqual([first, second, third, fourth].sort());
    expect(result.notes).toBe('Workout note');
    const kept = result.exercises.find(({ entryId }) => entryId === first)!;
    expect(kept.workoutGroupId).toBeNull();
    expect(kept.notes).toBe('Exercise note');
    expect(kept.sets[0]).toMatchObject({ id: setId, note: 'Set note', completedAt: expect.any(Date) });
  });

  it('keeps group layout on backup restore and gives repeated supersets independent settings', async () => {
    const { workoutId, entries } = await build();
    await changeWorkoutGroups(workoutId, { type: 'group', name: 'Pull', entryIds: entries.slice(0, 2) });
    const group = (await getActiveWorkout(workoutId))!.groupLayout!.groups.at(-1)!;
    await changeWorkoutGroups(workoutId, { type: 'superset', parentId: group.id, name: 'Pair', entryIds: entries.slice(0, 2) });
    const source = (await getActiveWorkout(workoutId))!;
    for (const entry of source.exercises) await completeSet(entry.sets[0].id);
    await finishWorkout(workoutId);
    const copy = (await getActiveWorkout(await repeatWorkout(workoutId)))!;
    expect(copy.groupLayout!.groups).toEqual(source.groupLayout!.groups);
    const originalPair = source.groupLayout!.supersets[0];
    const copiedPair = copy.groupLayout!.supersets[0];
    expect(copiedPair).toEqual({ id: expect.any(String), name: originalPair.name });
    expect(copiedPair.id).not.toBe(originalPair.id);
    await setSupersetRest(copiedPair.id, { mode: 'between', betweenSec: 30 });
    expect((await getCompletedWorkout(workoutId))!.exercises.find((entry) => entry.groupId === originalPair.id)?.groupType).toBe('superset');

    await importBackup(JSON.stringify(await createBackup()));
    const restored = (await getActiveWorkout(copy.id))!;
    expect(restored.groupLayout).toEqual(copy.groupLayout);
    expect(restored.exercises.filter(({ groupId }) => groupId === copiedPair.id)).toHaveLength(2);
    expect(restored.exercises.filter(({ workoutGroupId }) => workoutGroupId === group.id)).toHaveLength(2);
  });
});

describe('addWarmupSet', () => {
  const sets = (workoutId: string) => real.sqlite
    .prepare('SELECT s.set_index AS idx, s.kind AS kind, s.reps AS reps, s.side AS side FROM training_set s JOIN exercise_entry e ON e.id = s.entry_id WHERE e.workout_id = ? ORDER BY s.set_index, s.side')
    .all(workoutId) as { idx: number; kind: string; reps: number; side: string }[];

  it('puts warm-ups first, after the warm-ups already there, and renumbers the rest', async () => {
    const { addWarmupSet } = jest.requireActual('../repository');
    const { addSet } = jest.requireActual('../repository');
    const workoutId = await startWorkout('W');
    await addExerciseToWorkout(workoutId, 'push-up');
    const entry = (real.sqlite.prepare('SELECT id FROM exercise_entry WHERE workout_id = ?').get(workoutId) as { id: string }).id;
    await addSet(entry);
    await addWarmupSet(entry);
    await addWarmupSet(entry);
    expect(sets(workoutId).map(({ idx, kind }) => `${idx}:${kind}`)).toEqual(['1:warmup', '2:warmup', '3:working', '4:working']);
  });

  it('adds a left/right pair for a unilateral exercise', async () => {
    const { addWarmupSet } = jest.requireActual('../repository');
    const workoutId = await startWorkout('W');
    await addExerciseToWorkout(workoutId, 'reverse-lunge');
    const entry = (real.sqlite.prepare('SELECT id FROM exercise_entry WHERE workout_id = ?').get(workoutId) as { id: string }).id;
    await addWarmupSet(entry);
    expect(sets(workoutId).map(({ idx, kind, side }) => `${idx}:${kind}:${side}`)).toEqual(['1:warmup:left', '1:warmup:right', '2:working:left', '2:working:right']);
  });
});
