import {
  DEFAULT_PROGRESSION, duplicateGroup, filterPrograms, generateWeeks, groupTree, lowCategories, nextSession, parseQuickAdd,
  removeGroup, setsByCategory, type ProgramGroup,
} from '../programStructure';
import type { UserProgram, UserProgramExercise, UserProgramSession } from '../userProgram';

const ex = (id: string, over: Partial<UserProgramExercise> = {}): UserProgramExercise => ({ id, exerciseId: `x-${id}`, sets: 3, target: 8, ...over });
const ses = (id: string, groupId?: string | null, exercises: UserProgramExercise[] = [ex(`${id}-e`)]): UserProgramSession => ({ id, name: id, exercises, groupId });
const prog = (sessions: UserProgramSession[], over: Partial<UserProgram> = {}): UserProgram => ({ id: 'p', name: 'P', sessions, updatedAt: 'x', ...over });
const done = (...ids: string[]) => ids.map((id) => `P · ${id}`); // newest first
const counter = () => { let n = 0; return () => `n${(n += 1)}`; };
const g = (id: string, kind: ProgramGroup['kind'] = 'ordered', parentId?: string | null): ProgramGroup => ({ id, name: id, kind, parentId });

describe('nextSession', () => {
  it('sequence: old programs without layout rotate and wrap', () => {
    const p = prog([ses('a'), ses('b'), ses('c')]);
    expect(nextSession(p, [])?.id).toBe('a');
    expect(nextSession(p, done('a'))?.id).toBe('b');
    expect(nextSession(p, done('c', 'b'))?.id).toBe('a');
    expect(nextSession(prog([]), [])).toBeNull();
  });

  it('weeks: runs through groups in display order and wraps', () => {
    const p = prog([ses('w2a', 'w2'), ses('w1a', 'w1'), ses('w1b', 'w1')], { layout: 'weeks', groups: [g('w1'), g('w2')] });
    expect(nextSession(p, [])?.id).toBe('w1a');
    expect(nextSession(p, done('w1b'))?.id).toBe('w2a');
    expect(nextSession(p, done('w2a', 'w1b'))?.id).toBe('w1a');
  });

  describe('groups', () => {
    const p = prog(
      [ses('p1', 'push'), ses('p2', 'push'), ses('l1', 'pull'), ses('x1', 'extra'), ses('loose')],
      { layout: 'groups', groups: [g('push', 'pick'), g('pull'), g('extra', 'extra')] },
    );
    it('starts with the first group, picking the first never-done alternative', () => {
      expect(nextSession(p, [])?.id).toBe('p1');
    });
    it('rotates to the next group after one was trained', () => {
      expect(nextSession(p, done('p2'))?.id).toBe('l1');
      expect(nextSession(p, done('l1', 'p2'))?.id).toBe('p1');
    });
    it('pick: least recent wins, never done beats all', () => {
      expect(nextSession(p, done('l1', 'p1', 'p2'))?.id).toBe('p2');
      expect(nextSession(p, done('l1', 'p2', 'p1'))?.id).toBe('p1');
      expect(nextSession(p, done('l1', 'p1'))?.id).toBe('p2');
    });
    it('skips extras: doing an extra does not move the rotation', () => {
      expect(nextSession(p, done('x1', 'p1'))?.id).toBe('l1');
      const only = prog([ses('x1', 'extra'), ses('a')], { layout: 'groups', groups: [g('extra', 'extra')] });
      expect(nextSession(only, [])?.id).toBe('x1'); // no rotation unit: falls back to first
    });
    it('nested children are rotation units after their parent', () => {
      const n = prog([ses('c1', 'ph1'), ses('c2', 'ph2')], { layout: 'groups', groups: [g('ph', 'ordered'), g('ph1', 'ordered', 'ph'), g('ph2', 'ordered', 'ph')] });
      expect(nextSession(n, [])?.id).toBe('c1');
      expect(nextSession(n, done('c1'))?.id).toBe('c2');
      expect(nextSession(n, done('c2'))?.id).toBe('c1');
    });
  });
});

describe('groupTree', () => {
  it('lifts orphans and caps depth at two levels', () => {
    const tree = groupTree([g('a'), g('b', 'ordered', 'a'), g('c', 'ordered', 'b'), g('o', 'ordered', 'missing')]);
    expect(tree.map((t) => t.group.id)).toEqual(['a', 'c', 'o']);
    expect(tree[0].children.map((c) => c.id)).toEqual(['b']);
    expect(tree[1].children).toEqual([]);
  });
});

describe('generateWeeks', () => {
  const base = prog([ses('s', 'w1', [ex('e1', { target: 8, loadKg: 10, sets: 5 })])], { layout: 'weeks', groups: [g('w1')] });
  it('adds one rep per week with fresh ids and group ids', () => {
    const r = generateWeeks(base, 'w1', 2, DEFAULT_PROGRESSION, counter(), (i) => `W${i + 1}`);
    expect(r.groups.map((x) => x.name)).toEqual(['W2', 'W3']);
    expect(r.sessions.map((s) => s.exercises[0].target)).toEqual([9, 10]);
    expect(r.sessions.map((s) => s.groupId)).toEqual(r.groups.map((x) => x.id));
    const ids = [...r.groups.map((x) => x.id), ...r.sessions.map((s) => s.id), ...r.sessions.map((s) => s.exercises[0].id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('s');
    expect(base.sessions[0].exercises[0].target).toBe(8);
  });
  it('cap: resets reps and adds the load step', () => {
    const rule = { ...DEFAULT_PROGRESSION, loadStep: 2.5, targetCap: 9, resetTo: 6 };
    const r = generateWeeks(base, 'w1', 2, rule, counter(), String);
    expect(r.sessions.map((s) => [s.exercises[0].target, s.exercises[0].loadKg])).toEqual([[9, 10], [6, 12.5]]);
  });
  it('deload cuts sets, does not progress, and the next week continues from it', () => {
    const r = generateWeeks(base, 'w1', 3, { ...DEFAULT_PROGRESSION, deloadWeek: 2 }, counter(), String);
    const [w2, w3, w4] = r.sessions.map((s) => s.exercises[0]);
    expect([w2.target, w2.sets]).toEqual([9, 5]);
    expect([w3.target, w3.sets]).toEqual([9, 3]);
    expect(w4.target).toBe(10);
  });
  it('unknown source yields nothing', () => {
    expect(generateWeeks(base, 'nope', 2, DEFAULT_PROGRESSION, counter(), String)).toEqual({ groups: [], sessions: [] });
  });
});

describe('duplicateGroup / removeGroup', () => {
  const p = prog([ses('a', 'g1'), ses('b', 'g2')], { groups: [g('g1'), g('g2'), g('kid', 'ordered', 'g1')] });
  it('duplicates right after itself with fresh ids', () => {
    const r = duplicateGroup(p, 'g1', counter(), 'Copy');
    expect(r.groups!.map((x) => x.name)).toEqual(['g1', 'Copy', 'g2', 'kid']);
    const copy = r.sessions.filter((s) => s.groupId === 'n1');
    expect(copy).toHaveLength(1);
    expect(copy[0].id).not.toBe('a');
    expect(copy[0].exercises[0].id).not.toBe('a-e');
    expect(r.sessions).toHaveLength(3);
  });
  it('unknown id changes nothing', () => {
    expect(duplicateGroup(p, 'zz', counter(), 'x').sessions).toBe(p.sessions);
  });
  it('removes: sessions ungrouped, children lifted', () => {
    const r = removeGroup(p, 'g1');
    expect(r.groups!.map((x) => x.id)).toEqual(['g2', 'kid']);
    expect(r.groups![1].parentId).toBeNull();
    expect(r.sessions.find((s) => s.id === 'a')?.groupId).toBeNull();
    expect(r.sessions.find((s) => s.id === 'b')?.groupId).toBe('g2');
  });
});

describe('parseQuickAdd', () => {
  it('parses full lines', () => {
    expect(parseQuickAdd('curl 3x10 @7 r90')).toEqual({ query: 'curl', sets: 3, target: 10, timed: false, rpe: 7, restSeconds: 90, loadKg: null });
    expect(parseQuickAdd('plank 3x30s')).toMatchObject({ query: 'plank', sets: 3, target: 30, timed: true });
    expect(parseQuickAdd('trazioni 4x5 +10kg @8 r2:00')).toEqual({ query: 'trazioni', sets: 4, target: 5, timed: false, rpe: 8, restSeconds: 120, loadKg: 10 });
  });
  it('rejects lines without a valid NxM', () => {
    expect(parseQuickAdd('no numbers')).toBeNull();
    expect(parseQuickAdd('curl 3x0')).toBeNull();
    expect(parseQuickAdd('curl 0x10')).toBeNull();
  });
  it('ignores out of range RPE', () => {
    expect(parseQuickAdd('curl 3x10 @11')?.rpe).toBeNull();
  });
});

describe('setsByCategory / lowCategories', () => {
  const cats: Record<string, string[]> = { 'x-a': ['push'], 'x-b': ['pull', 'core'], 'x-w': ['push'] };
  it('sums working sets and skips warm-up and mobility', () => {
    const sessions = [{ exercises: [ex('a', { exerciseId: 'x-a', sets: 4 }), ex('b', { exerciseId: 'x-b', sets: 1 }), ex('w', { exerciseId: 'x-w', sets: 9, block: 'warmup' }), ex('m', { exerciseId: 'x-w', sets: 9, block: 'mobility' })] }];
    const totals = setsByCategory(sessions, (id) => cats[id] ?? []);
    expect([...totals]).toEqual([['push', 4], ['pull', 1], ['core', 1]]);
    expect(lowCategories(totals)).toEqual(['pull', 'core']);
  });
  it('lowCategories: empty and balanced give none; exactly half is not low', () => {
    expect(lowCategories(new Map())).toEqual([]);
    expect(lowCategories(new Map([['a', 4], ['b', 2]]))).toEqual([]);
  });
});

describe('filterPrograms', () => {
  const list = [{ name: 'Push Pull' }, { name: 'Legs', status: 'paused' as const }, { name: 'Old', status: 'archived' as const }];
  it('filters by status (missing = active) and query', () => {
    expect(filterPrograms(list, '', 'all')).toHaveLength(3);
    expect(filterPrograms(list, '', 'active').map((x) => x.name)).toEqual(['Push Pull']);
    expect(filterPrograms(list, '', 'paused').map((x) => x.name)).toEqual(['Legs']);
    expect(filterPrograms(list, '  PULL ', 'all').map((x) => x.name)).toEqual(['Push Pull']);
    expect(filterPrograms(list, 'zzz', 'all')).toEqual([]);
  });
});
