import type { DailyGoal } from '../dailyGoals';
import { applyGoalChange, groupGoalRows, moveGoalIds, tagRowsFor, tagRowsToChange } from '../tagGoals';

const goal = (over: Partial<DailyGoal>): DailyGoal => ({ id: 'g', scope: 'tag', key: 'Hip flexion', measure: 'minutes', target: 60, ...over });
const defaults = { minutes: 60, reps: 30 };

describe('tag goals', () => {
  it('starts a new tag with the total on, and loads the goals a tag already has', () => {
    expect(tagRowsFor([], 'Hip flexion', defaults).all.on).toBe(true);
    const rows = tagRowsFor([goal({ id: 'a', mobilityMode: 'active', target: 120 }), goal({ id: 'p', mobilityMode: 'passive', measure: 'reps', target: 20 }), goal({ id: 'o', key: 'Knee' })], 'Hip flexion', defaults);
    expect(rows.all).toMatchObject({ on: false });
    expect(rows.active).toMatchObject({ id: 'a', on: true, measure: 'minutes', target: 120 });
    expect(rows.passive).toMatchObject({ id: 'p', on: true, measure: 'reps', target: 20 });
  });

  it('turns rows into new, updated and removed goals', () => {
    const goals = [goal({ id: 'a', mobilityMode: 'active' }), goal({ id: 'p', mobilityMode: 'passive' })];
    const rows = tagRowsFor(goals, 'Hip flexion', defaults);
    rows.all = { on: true, measure: 'minutes', target: 180 };
    rows.active.target = 90;
    rows.passive.on = false;
    const change = tagRowsToChange('Hip flexion', rows, goals);
    expect(change.removeIds).toEqual(['p']);
    expect(change.drafts).toEqual([
      { scope: 'tag', key: 'Hip flexion', measure: 'minutes', target: 180 },
      { id: 'a', scope: 'tag', key: 'Hip flexion', measure: 'minutes', target: 90, mobilityMode: 'active' },
    ]);
    let n = 0;
    const next = applyGoalChange(goals, change, () => `new${++n}`);
    expect(next.map((item) => [item.id, item.mobilityMode ?? 'all', item.target])).toEqual([['a', 'active', 90], ['new1', 'all', 180]]);
  });

  it('moves the goals of the old tag when the sheet changes the tag', () => {
    const goals = [goal({ id: 'a', mobilityMode: 'active' }), goal({ id: 'x', key: 'Knee' })];
    const change = tagRowsToChange('Hip extension', tagRowsFor([], 'Hip extension', defaults), goals, 'Hip flexion');
    expect(change.removeIds).toEqual(['a']);
    expect(change.drafts).toHaveLength(1);
  });

  it('refuses more goals than the limit', () => {
    const many = Array.from({ length: 20 }, (_, index) => goal({ id: `g${index}`, key: `k${index}` }));
    expect(() => applyGoalChange(many, { drafts: [{ scope: 'tag', key: 'x', measure: 'minutes', target: 60 }], removeIds: [] }, () => 'n')).toThrow(RangeError);
  });
});

describe('goal list hierarchy', () => {
  const item = (over: Partial<DailyGoal>) => ({ goal: goal(over) });
  it('puts active and passive under the total, and a heading over them when there is no total', () => {
    const items = [item({ id: 'p', mobilityMode: 'passive' }), item({ id: 'k', key: 'Knee', mobilityMode: 'active' }), item({ id: 't' }), item({ id: 'c', scope: 'category', key: 'push' }), item({ id: 'a', mobilityMode: 'active' })];
    expect(groupGoalRows(items).map((entry) => (entry.kind === 'header' ? `# ${entry.key}` : `${entry.child ? '  ' : ''}${entry.item.goal.id}`))).toEqual(['t', '  a', '  p', '# Knee', '  k', 'c']);
  });

  it('moves a child among its siblings and a total with its group', () => {
    const items = [item({ id: 't' }), item({ id: 'a', mobilityMode: 'active' }), item({ id: 'p', mobilityMode: 'passive' }), item({ id: 'c', scope: 'category', key: 'push' })];
    expect(moveGoalIds(items, 'p', -1)).toEqual(['t', 'p', 'a', 'c']);
    expect(moveGoalIds(items, 'a', -1)).toBeNull();
    expect(moveGoalIds(items, 't', 1)).toEqual(['c', 't', 'a', 'p']);
    expect(moveGoalIds(items, 'c', 1)).toBeNull();
  });
});
