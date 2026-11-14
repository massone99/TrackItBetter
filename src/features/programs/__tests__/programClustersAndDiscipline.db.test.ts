import { migrateDatabase } from '../../../db/migrations';
import { filterPrograms, UNSET_FILTER } from '../../../domain/programStructure';
import {
  disciplineOf,
  normalizeClusterName,
  normalizeClusters,
  type UserProgram,
} from '../../../domain/userProgram';
import {
  clusterCounts,
  disciplineCounts,
  groupProgramsByCluster,
  programClusters,
} from '../list/derive';
import {
  createProgramCluster,
  deleteProgramCluster,
  listProgramClusters,
  listUserPrograms,
  renameProgramCluster,
  saveUserProgram,
} from '../userPrograms';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
const { mockReal: real } = jest.requireMock('../../../db/client');

const validSession = (id: string, name: string) => ({
  id,
  name,
  exercises: [{ id: `${id}-e1`, exerciseId: 'push-up', sets: 3, target: 10 }],
});

describe('custom clusters and strength/mobility discipline split', () => {
  beforeAll(async () => {
    await migrateDatabase(real.expo);
  });

  beforeEach(async () => {
    await real.expo.execAsync('DELETE FROM settings;');
  });

  it('normalizes cluster names and deduplicates case-insensitively', () => {
    expect(normalizeClusterName('  bands programs  ')).toBe('bands programs');
    expect(normalizeClusterName('   ')).toBeNull();
    expect(normalizeClusterName('x'.repeat(60))).toHaveLength(40);
    expect(normalizeClusters(['  bands programs ', 'Bands Programs', '', 'travel'])).toEqual([
      'bands programs',
      'travel',
    ]);
  });

  it('resolves discipline with strength default and mobility fallback', () => {
    expect(disciplineOf({ discipline: undefined, category: null })).toBe('strength');
    expect(disciplineOf({ discipline: undefined, category: 'Mobility' })).toBe('mobility');
    expect(disciplineOf({ discipline: 'strength', category: 'Mobility' })).toBe('strength');
    expect(disciplineOf({ discipline: 'mobility', category: 'General' })).toBe('mobility');
  });

  it('filters, counts, and groups programs by cluster and discipline', () => {
    const programs: UserProgram[] = [
      {
        id: '1',
        name: 'Band Upper',
        discipline: 'strength',
        clusters: ['bands programs', 'travel'],
        updatedAt: '2026-05-01T00:00:00.000Z',
        sessions: [validSession('s1', 'Upper')],
      },
      {
        id: '2',
        name: 'Hip & Shoulder Flow',
        discipline: 'mobility',
        clusters: ['bands programs'],
        updatedAt: '2026-05-02T00:00:00.000Z',
        sessions: [validSession('s2', 'Flow')],
      },
      {
        id: '3',
        name: 'Barbell Base',
        discipline: 'strength',
        updatedAt: '2026-05-03T00:00:00.000Z',
        sessions: [validSession('s3', 'Base')],
      },
    ];

    expect(disciplineCounts(programs)).toEqual({ strength: 2, mobility: 1 });
    expect(programClusters(programs, ['empty cluster'])).toEqual(['bands programs', 'empty cluster', 'travel']);
    expect(clusterCounts(programs).get('bands programs')).toBe(2);
    expect(clusterCounts(programs).get('travel')).toBe(1);

    expect(filterPrograms(programs, '', 'active', null, null, 'bands programs').map((p) => p.id)).toEqual(['1', '2']);
    expect(filterPrograms(programs, '', 'active', null, null, UNSET_FILTER).map((p) => p.id)).toEqual(['3']);
    expect(filterPrograms(programs, '', 'active', null, null, null, 'mobility').map((p) => p.id)).toEqual(['2']);
    expect(filterPrograms(programs, 'travel', 'active').map((p) => p.id)).toEqual(['1']);

    const grouped = groupProgramsByCluster(programs, ['bands programs', 'travel']);
    expect(grouped.map((g) => [g.cluster, g.programs.map((p) => p.id)])).toEqual([
      ['bands programs', ['1', '2']],
      ['travel', ['1']],
      [null, ['3']],
    ]);
  });

  it('persists discipline and custom clusters and supports cluster CRUD in SQLite', async () => {
    await createProgramCluster('bands programs');
    expect(await listProgramClusters()).toEqual(['bands programs']);

    const p1 = await saveUserProgram({
      name: 'Band Pulls',
      discipline: 'strength',
      clusters: ['bands programs', 'home'],
      sessions: [validSession('s1', 'Day 1')],
    });
    const p2 = await saveUserProgram({
      name: 'Morning Mobility',
      discipline: 'mobility',
      clusters: ['bands programs'],
      sessions: [validSession('s2', 'Flow')],
    });

    expect(await listProgramClusters()).toEqual(['bands programs', 'home']);
    let stored = await listUserPrograms();
    expect(stored.find((p) => p.id === p1.id)?.discipline).toBe('strength');
    expect(stored.find((p) => p.id === p2.id)?.discipline).toBe('mobility');
    expect(stored.find((p) => p.id === p1.id)?.clusters).toEqual(['bands programs', 'home']);

    await renameProgramCluster('bands programs', 'resistance bands');
    expect(await listProgramClusters()).toEqual(['home', 'resistance bands']);
    stored = await listUserPrograms();
    expect(stored.find((p) => p.id === p1.id)?.clusters).toEqual(['resistance bands', 'home']);
    expect(stored.find((p) => p.id === p2.id)?.clusters).toEqual(['resistance bands']);

    await deleteProgramCluster('resistance bands');
    expect(await listProgramClusters()).toEqual(['home']);
    stored = await listUserPrograms();
    expect(stored.find((p) => p.id === p1.id)?.clusters).toEqual(['home']);
    expect(stored.find((p) => p.id === p2.id)?.clusters).toBeUndefined();
  });
});
