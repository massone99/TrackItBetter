import { MAX_DAILY_GOALS, type DailyGoal, type DailyGoalMeasure, type GoalMobilityMode } from './dailyGoals';

/** The three goals one movement tag can carry: everything under it, or only its active or only its passive mobility. */
export type TagRowKey = 'all' | GoalMobilityMode;
export const TAG_ROWS: readonly TagRowKey[] = ['all', 'active', 'passive'];

export type TagRow = { id?: string; on: boolean; measure: DailyGoalMeasure; target: number };
export type TagRows = Record<TagRowKey, TagRow>;

export type GoalDraft = Omit<DailyGoal, 'id'> & { id?: string };
/** What a save of the goal sheet does: goals to add or update, and goals to remove. */
export type GoalChange = { drafts: GoalDraft[]; removeIds: string[] };

const rowOf = (goal: DailyGoal): TagRowKey => goal.mobilityMode ?? 'all';

/**
 * The rows of a tag's sheet: the goals that already count this tag are on with their own measure and
 * target; the others are off. A tag with no goal starts with the total on.
 */
export function tagRowsFor(goals: readonly DailyGoal[], key: string, defaults: Record<DailyGoalMeasure, number>): TagRows {
  const own = goals.filter((goal) => goal.scope === 'tag' && goal.key === key);
  const row = (name: TagRowKey): TagRow => {
    const found = own.find((goal) => rowOf(goal) === name);
    return found ? { id: found.id, on: true, measure: found.measure, target: found.target } : { on: name === 'all' && own.length === 0, measure: 'minutes', target: defaults.minutes };
  };
  return { all: row('all'), active: row('active'), passive: row('passive') };
}

/**
 * Turns the rows into changes: a row that is on becomes (or updates) a goal, a row that is off but had a
 * goal removes it. When the sheet moved from another tag (`from`), that tag's goals go away.
 */
export function tagRowsToChange(key: string, rows: TagRows, goals: readonly DailyGoal[], from?: string): GoalChange {
  const drafts: GoalDraft[] = [];
  const removeIds: string[] = [];
  for (const name of TAG_ROWS) {
    const row = rows[name];
    if (row.on) drafts.push({ ...(row.id ? { id: row.id } : {}), scope: 'tag', key, measure: row.measure, target: row.target, ...(name === 'all' ? {} : { mobilityMode: name }) });
    else if (row.id) removeIds.push(row.id);
  }
  if (from !== undefined && from !== key) {
    for (const goal of goals) if (goal.scope === 'tag' && goal.key === from) removeIds.push(goal.id);
  }
  return { drafts, removeIds };
}

/** Applies a change to a list of goals, in place order: removals first, then updates, then new goals at the end. */
export function applyGoalChange(goals: readonly DailyGoal[], change: GoalChange, newId: () => string): DailyGoal[] {
  const removed = new Set(change.removeIds);
  const next = goals.filter((goal) => !removed.has(goal.id));
  for (const draft of change.drafts) {
    const index = draft.id ? next.findIndex((goal) => goal.id === draft.id) : -1;
    const saved: DailyGoal = { ...draft, id: draft.id ?? newId() };
    if (index >= 0) next[index] = saved;
    else next.push(saved);
  }
  if (next.length > MAX_DAILY_GOALS) throw new RangeError('Too many goals');
  return next;
}
