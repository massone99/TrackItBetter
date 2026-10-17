import { planImport } from '../importJson';
import example from '../../../../docs/import-examples/tom-merrick-full-body-mobility.json';

jest.mock('expo-crypto', () => ({ randomUUID: jest.requireActual('node:crypto').randomUUID }));
jest.mock('../../../db/client', () => ({ db: {}, initializeDatabase: jest.fn() }));

const base = { format: 'trackitbetter-import', version: 1 };
const pullUp = { id: 'pull-up', name: 'Pull-up' };

describe('planImport', () => {
  it('accepts the Tom Merrick example: 14 new movements and one routine of 15 steps', () => {
    const plan = planImport(JSON.stringify(example), []);
    expect(plan.create).toHaveLength(14);
    expect(plan.file.mobilityRoutines).toHaveLength(1);
    expect(plan.file.mobilityRoutines[0].steps).toHaveLength(15);
  });

  it('reuses a movement already in the app, by name, and creates only the others', () => {
    const plan = planImport(JSON.stringify(example), [{ id: 'mine', name: 'neck circles' }]);
    expect(plan.create).toHaveLength(13);
    expect(plan.existing.get('neck-circles')).toBe('mine');
  });

  it('accepts programs that point at movements of the app by id or by name', () => {
    const file = { ...base, programs: [{ name: 'Plan', sessions: [{ name: 'A', exercises: [{ exercise: 'pull-up', sets: 3, target: 5 }, { exercise: 'Pull-Up', sets: 2 }] }] }] };
    expect(planImport(JSON.stringify(file), [pullUp]).file.programs).toHaveLength(1);
  });

  it('refuses unknown movements, duplicate keys, bad shapes and empty files, naming the problem', () => {
    const run = (value: unknown) => () => planImport(typeof value === 'string' ? value : JSON.stringify(value), [pullUp]);
    const program = (exercise: string) => ({ ...base, programs: [{ name: 'Plan', sessions: [{ name: 'A', exercises: [{ exercise }] }] }] });
    expect(run(program('ghost'))).toThrow(/unknownExercise: ghost/);
    const twice = { key: 'a', name: 'A', metric: 'reps', category: 'mobility' };
    expect(run({ ...base, exercises: [twice, { ...twice, name: 'B' }] })).toThrow(/duplicateKey: a/);
    expect(run('not json')).toThrow(/invalid/);
    expect(run({ ...base, version: 2 })).toThrow(/invalid/);
    expect(run(base)).toThrow(/empty/);
    expect(run({ ...base, mobilityRoutines: [{ name: 'R', steps: [] }] })).toThrow(/invalid/);
  });
});
