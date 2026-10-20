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

/** A line of the goals list: a goal (a child sits under its tag) or the heading of a tag that has no total goal. */
export type GoalListEntry<T extends { goal: DailyGoal }> = { kind: 'goal'; item: T; child: boolean } | { kind: 'header'; key: string };

const ORDER: Record<TagRowKey, number> = { all: 0, active: 1, passive: 2 };

/** The goals of each tag together, in the position of the first one: the total, then active, then passive under it. */
function blocksOf<T extends { goal: DailyGoal }>(items: readonly T[]): { key: string | null; total: T | null; children: T[] }[] {
  const blocks: { key: string | null; total: T | null; children: T[] }[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const { goal } = item;
    if (goal.scope !== 'tag') { blocks.push({ key: null, total: item, children: [] }); continue; }
    if (seen.has(goal.key)) continue;
    seen.add(goal.key);
    const own = items.filter((other) => other.goal.scope === 'tag' && other.goal.key === goal.key);
    const total = own.find((other) => !other.goal.mobilityMode) ?? null;
    const children = own.filter((other) => other !== total).sort((a, b) => ORDER[a.goal.mobilityMode ?? 'all'] - ORDER[b.goal.mobilityMode ?? 'all']);
    blocks.push({ key: goal.key, total, children });
  }
  return blocks;
}

export function groupGoalRows<T extends { goal: DailyGoal }>(items: readonly T[]): GoalListEntry<T>[] {
  const entries: GoalListEntry<T>[] = [];
  for (const block of blocksOf(items)) {
    if (block.total) entries.push({ kind: 'goal', item: block.total, child: false });
    else if (block.key !== null) entries.push({ kind: 'header', key: block.key });
    for (const item of block.children) entries.push({ kind: 'goal', item, child: true });
  }
  return entries;
}

/**
 * The goal ids in storage order after moving one goal a place up (-1) or down (+1) as the list shows it:
 * a child moves among the children of its tag, a total or a plain goal moves with its whole group.
 * Null when it cannot move that way.
 */
export function moveGoalIds<T extends { goal: DailyGoal }>(items: readonly T[], id: string, delta: -1 | 1): string[] | null {
  const blocks = blocksOf(items);
  const at = blocks.findIndex((block) => block.total?.goal.id === id || block.children.some((child) => child.goal.id === id));
  if (at < 0) return null;
  const block = blocks[at];
  const childIndex = block.children.findIndex((child) => child.goal.id === id);
  if (childIndex >= 0) {
    const target = childIndex + delta;
    if (target < 0 || target >= block.children.length) return null;
    [block.children[childIndex], block.children[target]] = [block.children[target], block.children[childIndex]];
  } else {
    const target = at + delta;
    if (target < 0 || target >= blocks.length) return null;
    [blocks[at], blocks[target]] = [blocks[target], blocks[at]];
  }
  return blocks.flatMap((entry) => [...(entry.total ? [entry.total] : []), ...entry.children]).map((item) => item.goal.id);
}
