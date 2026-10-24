import { migrateDatabase } from '../../../db/migrations';
import { seedCatalogIfEmpty } from '../../../db/seed/import';
import { createCustomExercise } from '../../exercises/customRepository';
import { ImportError, importJson } from '../../data/importJson';
import { addLink, createChain, getChain, listChains, listLinks } from '../chains';
import { buildChainsFile } from '../exportChains';
import example from '../../../../docs/import-examples/example-chains.json';
import { createBackup, importBackup } from '../../data/backup';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
jest.mock('expo-file-system', () => ({ Paths: {}, Directory: function MockDirectory() { return { exists: false, create: () => undefined, delete: () => undefined }; }, File: function MockFile() { return { exists: false }; } }));
jest.mock('expo-sharing', () => ({}));
const { mockReal: real } = jest.requireMock('../../../db/client');

/** A fresh install: every table emptied, then the catalog seeded again. */
async function freshApp() {
  real.sqlite.exec(`
    DELETE FROM exercise_link; DELETE FROM chain_step; DELETE FROM level_criteria; DELETE FROM progression_chain;
    DELETE FROM training_set; DELETE FROM exercise_entry; DELETE FROM workout; DELETE FROM exercise_image; DELETE FROM exercise;
  `);
  await seedCatalogIfEmpty(real.db);
}

beforeAll(async () => {
  await migrateDatabase(real.expo);
  await seedCatalogIfEmpty(real.db);
});

describe('chains in import and export files', () => {
  it('imports the documented example and adds nothing the second time', async () => {
    expect(await importJson(JSON.stringify(example))).toMatchObject({ exercisesCreated: 1, chainsCreated: 1, stepsAdded: 3, linksAdded: 2 });
    expect(await importJson(JSON.stringify(example))).toMatchObject({ exercisesCreated: 0, chainsCreated: 0, stepsAdded: 0, linksAdded: 0 });
    const chain = (await listChains()).find((item) => item.name === 'My planche path')!;
    expect(chain.steps.map((step) => step.criteria?.seconds)).toEqual([30, 20, 10]);
    expect(chain.family).toBe('Planche');
    await freshApp();
  });


  it('exports chains and relations, re-imports without adding anything, and round-trips into a fresh app', async () => {
    const lean = await createCustomExercise({ name: 'My Planche Lean', metric: 'time', category: 'skill', equipment: [], cues: ['Lean past the hands'] });
    const chain = await createChain({ name: 'My planche path', description: 'From lean to tuck', family: 'planche' }, [lean, 'tuck-planche']);
    await addLink({ fromId: lean, toId: 'push-up', kind: 'variation', criteria: null, note: 'same line' });
    const steps = (await getChain(chain))!.steps;
    expect(steps.map((step) => step.name)).toEqual(['My Planche Lean', 'Tuck Planche']);
    const file = await buildChainsFile(null);
    expect(file.chains.find((item) => item.name === 'My planche path')?.steps.map((step) => step.exercise)).toEqual(['my-planche-lean', 'tuck-planche']);

    const again = await importJson(JSON.stringify(file));
    expect(again).toMatchObject({ exercisesCreated: 0, chainsCreated: 0, stepsAdded: 0, linksAdded: 0 });

    await freshApp();
    const imported = await importJson(JSON.stringify(file));
    expect(imported).toMatchObject({ exercisesCreated: 1, chainsCreated: 1, stepsAdded: 2, linksAdded: 1 });
    // Identical, but for the ids of your own exercises, which each device makes up.
    const withoutOwnIds = (value: typeof file) => ({ ...value, exercises: value.exercises.map((item) => (item.key === 'my-planche-lean' ? { ...item, id: '' } : item)) });
    expect(withoutOwnIds(await buildChainsFile(null))).toEqual(withoutOwnIds(file));
  });

  it('keeps an exported movement apart from another one with the same name in the same app', async () => {
    const twin = await createCustomExercise({ name: 'Tuck Planche', metric: 'time', category: 'skill', equipment: [], cues: [] });
    const chain = await createChain({ name: 'Twins', description: '', family: '' }, [twin]);
    const file = await buildChainsFile([chain]);
    expect(await importJson(JSON.stringify(file))).toMatchObject({ exercisesCreated: 0, stepsAdded: 0 });
    expect((await getChain(chain))!.steps.map((step) => step.exerciseId)).toEqual([twin]);
  });

  it('adds only the missing steps to a chain with the same name, and refuses a file that would make a loop', async () => {
    const before = (await listChains()).find((item) => item.name === 'My planche path')!;
    const addendum = { format: 'trackitbetter-import', version: 1, chains: [{ name: 'my planche PATH', steps: [{ exercise: 'tuck-planche' }, { exercise: 'push-up', criteria: { sets: 3, reps: 10 } }] }] };
    expect(await importJson(JSON.stringify(addendum))).toMatchObject({ chainsCreated: 0, stepsAdded: 1 });
    const after = (await getChain(before.id))!;
    expect(after.steps.map((step) => step.exerciseId).slice(-1)).toEqual(['push-up']);
    expect(after.steps.at(-1)!.criteria).toEqual({ sets: 3, reps: 10, requiredSessions: 1 });

    const loop = { format: 'trackitbetter-import', version: 1, links: [{ from: 'push-up', to: 'tuck-planche', kind: 'progression' }] };
    await expect(importJson(JSON.stringify(loop))).rejects.toThrow(ImportError);
    await expect(importJson(JSON.stringify(loop))).rejects.toThrow(/cycle: Tuck Planche → Push-up → Tuck Planche|cycle: Push-up → Tuck Planche → Push-up/);
    expect(await listLinks('push-up')).toHaveLength(1);
  });

  it('keeps chains and relations through a backup, and rebuilds the catalog chains from an older backup', async () => {
    const before = await buildChainsFile(null);
    const backup = await createBackup();
    await importBackup(JSON.stringify(backup), 'replace');
    expect(await buildChainsFile(null)).toEqual(before);
    const old = { ...backup, data: { ...backup.data } } as Record<string, unknown> & { data: Record<string, unknown> };
    delete old.data.chainSteps;
    delete old.data.exerciseLinks;
    await importBackup(JSON.stringify(old), 'replace');
    const rebuilt = await listChains();
    expect(rebuilt.find((chain) => chain.id === 'planche-progression')!.steps.length).toBeGreaterThan(1);
    expect(await listLinks('push-up')).toEqual([]);
  });
});
