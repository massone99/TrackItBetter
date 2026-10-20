import type { DailyGoal } from '../dailyGoals';
import { applyGoalChange, tagRowsFor, tagRowsToChange } from '../tagGoals';

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
