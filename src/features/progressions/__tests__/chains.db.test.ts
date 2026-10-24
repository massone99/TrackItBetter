import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { transferExerciseHistory, deleteExerciseWithHistory } from '../../exercises/lifecycle';
import {
  addLink, addStep, createChain, deleteChain, deleteLink, duplicateChain, getChain, getExerciseProgressions, GraphError, listChains,
  listLinks, markStepReached, mergeChains, moveStep, removeStep, restoreLink, restoreStep, splitChain, unlinkedExercises, updateLink, updateStepCriteria,
} from '../chains';
import { getProgressionChain } from '../repository';
import chainsSeed from '../../../db/seed/progression-chains.json';
import criteriaSeed from '../../../db/seed/level-criteria.json';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
const { mockReal: real } = jest.requireMock('../../../db/client');

const names = async (id: string) => (await getChain(id))!.steps.map((step) => step.exerciseId);
const problem = async (action: Promise<unknown>) => {
  try { await action; return null; } catch (error) { return error instanceof GraphError ? error.problem : String(error); }
};

beforeAll(async () => {
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
});

describe('progression chains', () => {
  it('turns every catalog chain into ordered steps with the same exercises, order and criteria', async () => {
    const chains = await listChains();
    expect(chains).toHaveLength(chainsSeed.length);
    for (const seed of chainsSeed) {
      const chain = chains.find((item) => item.id === seed.id)!;
      const levels = [...seed.levels].sort((a, b) => a.level - b.level);
      expect(chain.steps.map((step) => step.exerciseId)).toEqual(levels.map((level) => level.exerciseId));
      for (const criterion of criteriaSeed.filter((item) => item.chainId === seed.id)) {
        const step = chain.steps[criterion.level - 1];
        const target = criterion.target as { sets: number; reps?: number; durationSec?: number };
        expect(step.criteria).toEqual(target.durationSec !== undefined
          ? { sets: target.sets, seconds: target.durationSec, requiredSessions: criterion.requiredSessions }
          : { sets: target.sets, reps: target.reps, requiredSessions: criterion.requiredSessions });
      }
    }
    const skill = await getProgressionChain('pull-up-progression');
    expect(skill!.levels.map((level) => level.level)).toEqual(skill!.levels.map((_, index) => index + 1));
  });

  it('creates, orders and edits a custom chain, refusing an exercise twice and a loop', async () => {
    const id = await createChain({ name: '  My planche ', description: '', family: 'skill' }, ['push-up', 'parallel-bar-dip']);
    expect((await getChain(id))!.name).toBe('My planche');
    expect(await problem(addStep(id, 'push-up'))).toEqual({ kind: 'inChain' });
    const [first] = (await getChain(id))!.steps;
    await addStep(id, 'bench-dip', first.id, { sets: 3, reps: 8, requiredSessions: 2 });
    expect(await names(id)).toEqual(['push-up', 'bench-dip', 'parallel-bar-dip']);
    const middle = (await getChain(id))!.steps[1];
    expect(middle.criteria).toEqual({ sets: 3, reps: 8, requiredSessions: 2 });
    await updateStepCriteria(middle.id, { sets: 2, seconds: 20, requiredSessions: 1 });
    await moveStep(middle.id, 1);
    expect(await names(id)).toEqual(['push-up', 'parallel-bar-dip', 'bench-dip']);
    expect((await getChain(id))!.steps[2].criteria).toEqual({ sets: 2, seconds: 20, requiredSessions: 1 });
    // A relation back down the chain would close a loop.
    expect(await problem(addLink({ fromId: 'bench-dip', toId: 'push-up', kind: 'progression', criteria: null, note: '' })))
      .toEqual({ kind: 'cycle', path: ['push-up', 'parallel-bar-dip', 'bench-dip', 'push-up'] });
    const removed = await removeStep(middle.id);
    expect(await names(id)).toEqual(['push-up', 'parallel-bar-dip']);
    await restoreStep(removed!);
    expect(await names(id)).toEqual(['push-up', 'parallel-bar-dip', 'bench-dip']);
    await markStepReached((await getChain(id))!.steps[1].id, true);
    expect((await getChain(id))!.reachedLevel).toBe(2);
    await deleteChain(id);
    expect(await getChain(id)).toBeNull();
  });

  it('duplicates, splits and merges chains', async () => {
    const id = await createChain({ name: 'Base', description: 'd', family: 'f' }, ['push-up', 'parallel-bar-dip', 'bench-dip']);
    const copy = (await duplicateChain(id, 'Copy'))!;
    expect(await names(copy)).toEqual(['push-up', 'parallel-bar-dip', 'bench-dip']);
    await deleteChain(copy);
    const tail = (await splitChain((await getChain(id))!.steps[1].id, 'Tail'))!;
    expect(await names(id)).toEqual(['push-up']);
    expect(await names(tail)).toEqual(['parallel-bar-dip', 'bench-dip']);
    await mergeChains(id, tail);
    expect(await names(id)).toEqual(['push-up', 'parallel-bar-dip', 'bench-dip']);
    expect(await getChain(tail)).toBeNull();
    await deleteChain(id);
  });

  it('adds, edits, deletes and restores single relations, and builds the tree of an exercise', async () => {
    expect(await problem(addLink({ fromId: 'band-assisted-dip', toId: 'band-assisted-dip', kind: 'variation', criteria: null, note: '' }))).toEqual({ kind: 'self' });
    const link = await addLink({ fromId: 'bench-dip', toId: 'band-assisted-dip', kind: 'prerequisite', criteria: { sets: 3, reps: 12, requiredSessions: 2 }, note: ' first ' });
    expect(await problem(addLink({ fromId: 'bench-dip', toId: 'band-assisted-dip', kind: 'prerequisite', criteria: null, note: '' }))).toEqual({ kind: 'duplicate' });
    expect((await listLinks('band-assisted-dip')).map((item) => [item.fromName, item.kind, item.note])).toEqual([['Bench Dip', 'prerequisite', 'first']]);
    await updateLink(link, { fromId: 'band-assisted-dip', toId: 'bench-dip', kind: 'variation', criteria: null, note: '' });
    expect((await listLinks('band-assisted-dip'))[0]).toMatchObject({ fromId: 'band-assisted-dip', toId: 'bench-dip', kind: 'variation', criteria: null });
    const view = await getExerciseProgressions('band-assisted-dip');
    expect(view.tree.variations).toEqual(['bench-dip']);
    expect(view.chains.map((chain) => chain.id)).toEqual(['dip-progression']);
    expect(view.tree.regressions.length + view.tree.progressions.length).toBeGreaterThan(0);
    const row = await deleteLink(link);
    expect(await listLinks('band-assisted-dip')).toEqual([]);
    await restoreLink(row!);
    expect(await listLinks('band-assisted-dip')).toHaveLength(1);
    expect((await unlinkedExercises()).some((exercise) => exercise.id === 'bench-dip')).toBe(false);
  });

  it('moves chain places and relations to the target when history moves, and drops them with the exercise', async () => {
    const source = 'scapular-pull-up';
    const id = await createChain({ name: 'Move', description: '', family: '' }, [source, 'pike-push-up']);
    await addLink({ fromId: source, toId: 'decline-push-up', kind: 'progression', criteria: null, note: '' });
    real.sqlite.prepare("INSERT INTO exercise (id, name, metric, category, created_at) VALUES ('target-x', 'Target X', 'reps', 'push', 1)").run();
    await transferExerciseHistory(source, 'target-x', { deleteSource: true });
    expect(await names(id)).toEqual(['target-x', 'pike-push-up']);
    expect((await listLinks('target-x')).map((item) => item.toId)).toEqual(['decline-push-up']);
    await deleteExerciseWithHistory('target-x');
    expect(await names(id)).toEqual(['pike-push-up']);
    expect(await listLinks('decline-push-up')).toEqual([]);
  });
});
