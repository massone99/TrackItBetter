import { parsePrograms } from '../userPrograms';

jest.mock('../../../db/client', () => ({ db: {}, initializeDatabase: jest.fn() }));

const exercise = { id: 'e', exerciseId: 'push-up', sets: 3, target: 8, restSeconds: 90 };

describe('parsePrograms structure fields', () => {
  it('keeps status, layout, groups, lastUsedAt and session groupId', () => {
    const [p] = parsePrograms([{
      id: 'p', name: 'Plan', updatedAt: 'x', status: 'paused', layout: 'groups', lastUsedAt: '2026-01-01',
      groups: [{ id: 'g', name: 'Push', kind: 'pick' }, { id: 'h', name: 'Kid', kind: 'ordered', parentId: 'g' }],
      sessions: [{ id: 's', name: 'A', groupId: 'g', exercises: [exercise] }],
    }]);
    expect(p.status).toBe('paused');
    expect(p.layout).toBe('groups');
    expect(p.lastUsedAt).toBe('2026-01-01');
    expect(p.groups?.map((x) => x.id)).toEqual(['g', 'h']);
    expect(p.groups?.[0].kind).toBe('pick');
    expect(p.sessions[0].groupId).toBe('g');
  });

  it('drops invalid groups and unknown status/layout', () => {
    const [p] = parsePrograms([{
      id: 'p', name: 'Plan', updatedAt: 'x', status: 'weird', layout: 'nope',
      groups: [{ id: 'ok', name: 'Ok', kind: 'ordered' }, { id: 'bad', name: 'Bad', kind: 'wat' }, { name: 'noid', kind: 'ordered' }, null, 'x'],
      sessions: [{ id: 's', name: 'A', exercises: [exercise] }],
    }]);
    expect(p.status).toBeUndefined();
    expect(p.layout).toBeUndefined();
    expect(p.groups?.map((x) => x.id)).toEqual(['ok']);
    expect(p.sessions[0].groupId).toBeNull();
  });

  it('old programs have no groups', () => {
    const [p] = parsePrograms([{ id: 'p', name: 'Plan', updatedAt: 'x', sessions: [{ id: 's', name: 'A', exercises: [exercise] }] }]);
    expect(p.groups).toBeUndefined();
    expect(p.lastUsedAt).toBeNull();
  });
});
