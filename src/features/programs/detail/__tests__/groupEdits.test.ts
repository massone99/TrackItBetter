import type { UserProgram } from '../../../../domain/userProgram';
import { addGroup, buildSections, doneSessionIds, editGroup, moveSessionToGroup, parentOptions, removeGroups, setGroupParent, UNGROUPED_ID, withFirstGroup } from '../groupEdits';

const exercise = { id: 'e', exerciseId: 'x', sets: 3, target: 8 };
const session = (id: string, groupId?: string) => ({ id, name: id, exercises: [exercise], groupId: groupId ?? null });
const program = (over: Partial<UserProgram> = {}): UserProgram => ({
  id: 'p', name: 'P', updatedAt: '', layout: 'groups',
  groups: [{ id: 'g1', name: 'A', kind: 'ordered' }, { id: 'g2', name: 'B', kind: 'pick', parentId: 'g1' }, { id: 'g3', name: 'C', kind: 'extra' }],
  sessions: [session('a', 'g1'), session('b', 'g2'), session('c', 'g2'), session('d'), session('e', 'gone')],
  ...over,
});
let n = 0;
const newId = () => `n${++n}`;

describe('program detail group edits', () => {
  it('builds sections with nested progress, current and ungrouped', () => {
    const p = program();
    const sections = buildSections(p, doneSessionIds(p, ['P · a', 'P · b']), 'c');
    expect(sections.map((s) => s.id)).toEqual(['g1', 'g3', UNGROUPED_ID]);
    expect(sections[0].progress).toEqual({ done: 2, total: 3 });
    expect(sections[0].current).toBe(true);
    expect(sections[0].children[0].progress).toEqual({ done: 1, total: 2 });
    expect(sections[2].sessions.map((s) => s.id)).toEqual(['d', 'e']);
    expect(sections[1].current).toBe(false);
  });

  it('puts every workout in a first group only when there are no groups', () => {
    const p = program({ groups: undefined });
    const result = withFirstGroup(p, 'Week 1', newId)!;
    expect(result.groups).toHaveLength(1);
    expect(result.sessions.every((s) => s.groupId === result.groups![0].id)).toBe(true);
    expect(withFirstGroup(program(), 'x', newId)).toBeNull();
  });

  it('adds, edits and moves', () => {
    const p = program();
    expect(addGroup(p, ' New ', 'pick', newId).groups!.at(-1)).toMatchObject({ name: 'New', kind: 'pick', parentId: null });
    expect(editGroup(p, 'g3', { name: ' ', kind: 'ordered' }).groups![2]).toMatchObject({ name: 'C', kind: 'ordered' });
    expect(moveSessionToGroup(p, 'd', 'g3').sessions.find((s) => s.id === 'd')!.groupId).toBe('g3');
    expect(moveSessionToGroup(p, 'a', null).sessions[0].groupId).toBeNull();
  });

  it('keeps nesting to two levels', () => {
    const p = program();
    expect(parentOptions(p.groups!, 'g1')).toEqual([]);
    expect(parentOptions(p.groups!, 'g3').map((g) => g.id)).toEqual(['g1']);
    expect(parentOptions(p.groups!, 'g2').map((g) => g.id)).toEqual(['g1', 'g3']);
    expect(setGroupParent(p, 'g3', 'g2').groups![2].parentId).toBeUndefined();
    expect(setGroupParent(p, 'g3', 'g1').groups![2].parentId).toBe('g1');
  });
});

describe('removing several groups', () => {
  it('keeps their workouts ungrouped', () => {
    const result = removeGroups(program(), new Set(['g1', 'g3']), false);
    expect(result.groups?.map((g) => g.id)).toEqual(['g2']);
    expect(result.groups?.[0].parentId).toBeNull();
    expect(result.sessions.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result.sessions.find((s) => s.id === 'a')?.groupId).toBeNull();
    expect(result.sessions.find((s) => s.id === 'b')?.groupId).toBe('g2');
  });

  it('deletes their workouts too, but not those of a sub-group that stays', () => {
    const result = removeGroups(program(), new Set(['g1']), true);
    expect(result.sessions.map((s) => s.id)).toEqual(['b', 'c', 'd', 'e']);
    const both = removeGroups(program(), new Set(['g1', 'g2']), true);
    expect(both.sessions.map((s) => s.id)).toEqual(['d', 'e']);
    expect(both.groups?.map((g) => g.id)).toEqual(['g3']);
  });
});
