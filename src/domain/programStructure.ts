import { programSessionWorkoutName, type UserProgram, type UserProgramExercise, type UserProgramSession } from './userProgram';

/** Where a program stands in the Programs list: only active ones compete for "next workout". */
export type ProgramStatus = 'active' | 'paused' | 'archived';
export const PROGRAM_STATUSES: readonly ProgramStatus[] = ['active', 'paused', 'archived'];

/**
 * How a program organises its workouts.
 * - `sequence`: one flat rotation (the original behaviour).
 * - `weeks`: groups are weeks or phases done in order; the rotation runs through every workout in order.
 * - `groups`: groups rotate; inside a `pick` group the person picks one of N alternatives.
 */
export type ProgramLayout = 'sequence' | 'weeks' | 'groups';
export const PROGRAM_LAYOUTS: readonly ProgramLayout[] = ['sequence', 'weeks', 'groups'];

/**
 * - `ordered`: every workout, in order (a week, a phase).
 * - `pick`: alternatives; one of them counts as the group's turn.
 * - `extra`: outside the rotation, done whenever.
 */
export type GroupKind = 'ordered' | 'pick' | 'extra';
export const GROUP_KINDS: readonly GroupKind[] = ['ordered', 'pick', 'extra'];

export interface ProgramGroup {
  id: string;
  name: string;
  kind: GroupKind;
  /** One level of nesting: a group may sit inside another (Phase › Week, Phase › alternatives). */
  parentId?: string | null;
}

export const MAX_GROUP_DEPTH = 2;

/** Groups in display order as a tree of at most two levels; orphans and deeper levels are lifted to the top. */
export function groupTree(groups: readonly ProgramGroup[]): { group: ProgramGroup; children: ProgramGroup[] }[] {
  const ids = new Set(groups.map((group) => group.id));
  const topLevel = (group: ProgramGroup) => !group.parentId || !ids.has(group.parentId) || groups.find((item) => item.id === group.parentId)?.parentId;
  return groups.filter(topLevel).map((group) => ({ group, children: groups.filter((child) => child.parentId === group.id && !topLevel(child)) }));
}

/** Sessions of a group in program order. */
export function sessionsInGroup(program: Pick<UserProgram, 'sessions'>, groupId: string): UserProgramSession[] {
  return program.sessions.filter((session) => session.groupId === groupId);
}

/** Sessions with no group, or whose group no longer exists. */
export function ungroupedSessions(program: Pick<UserProgram, 'sessions' | 'groups'>): UserProgramSession[] {
  const ids = new Set((program.groups ?? []).map((group) => group.id));
  return program.sessions.filter((session) => !session.groupId || !ids.has(session.groupId));
}

/** Index of the most recent workout of this program in `recentWorkoutNames` (newest first), per session id. */
function lastDoneIndex(program: UserProgram, recentWorkoutNames: readonly string[]): Map<string, number> {
  const byName = new Map(program.sessions.map((session) => [programSessionWorkoutName(program, session), session.id]));
  const result = new Map<string, number>();
  recentWorkoutNames.forEach((name, index) => {
    const id = byName.get(name);
    if (id && !result.has(id)) result.set(id, index);
  });
  return result;
}

/** Leaf groups (those that hold sessions) in rotation order, skipping extras. */
function rotationUnits(program: UserProgram): ProgramGroup[] {
  const tree = groupTree(program.groups ?? []);
  const units: ProgramGroup[] = [];
  for (const { group, children } of tree) {
    if (group.kind === 'extra') continue;
    if (sessionsInGroup(program, group.id).length > 0) units.push(group);
    for (const child of children) if (child.kind !== 'extra' && sessionsInGroup(program, child.id).length > 0) units.push(child);
  }
  return units;
}

/**
 * The workout to put forward next.
 * `sequence` and `weeks`: the one after the latest done, wrapping (weeks run through every workout in display order).
 * `groups`: the group after the one trained last; inside a pick group, the alternative done least recently.
 */
export function nextSession(program: UserProgram, recentWorkoutNames: readonly string[]): UserProgramSession | null {
  const layout = program.layout ?? 'sequence';
  const ordered = orderedSessions(program);
  if (ordered.length === 0) return null;
  const done = lastDoneIndex(program, recentWorkoutNames);
  if (layout !== 'groups') {
    let latest: number | null = null;
    let latestAt = Number.POSITIVE_INFINITY;
    ordered.forEach((session, index) => { const at = done.get(session.id); if (at !== undefined && at < latestAt) { latestAt = at; latest = index; } });
    return latest === null ? ordered[0] : ordered[(latest + 1) % ordered.length];
  }
  const units = rotationUnits(program);
  if (units.length === 0) return ordered[0];
  let lastUnit = -1;
  let lastAt = Number.POSITIVE_INFINITY;
  units.forEach((unit, index) => {
    for (const session of sessionsInGroup(program, unit.id)) {
      const at = done.get(session.id);
      if (at !== undefined && at < lastAt) { lastAt = at; lastUnit = index; }
    }
  });
  const unit = units[(lastUnit + 1) % units.length];
  return pickInGroup(program, unit, done);
}

function pickInGroup(program: UserProgram, unit: ProgramGroup, done: Map<string, number>): UserProgramSession {
  const sessions = sessionsInGroup(program, unit.id);
  if (unit.kind === 'pick') {
    // Least recently done first; never done beats everything, earlier in the list wins ties.
    return [...sessions].sort((a, b) => (done.get(b.id) ?? Number.POSITIVE_INFINITY) - (done.get(a.id) ?? Number.POSITIVE_INFINITY))[0];
  }
  let latest = -1;
  let latestAt = Number.POSITIVE_INFINITY;
  sessions.forEach((session, index) => { const at = done.get(session.id); if (at !== undefined && at < latestAt) { latestAt = at; latest = index; } });
  return sessions[(latest + 1) % sessions.length];
}

/** Every session in display order: groups (and their children) first, ungrouped last; sequence keeps stored order. */
export function orderedSessions(program: Pick<UserProgram, 'sessions' | 'groups' | 'layout'>): UserProgramSession[] {
  if ((program.layout ?? 'sequence') === 'sequence' || !program.groups?.length) return program.sessions;
  const result: UserProgramSession[] = [];
  for (const { group, children } of groupTree(program.groups)) {
    result.push(...sessionsInGroup(program, group.id));
    for (const child of children) result.push(...sessionsInGroup(program, child.id));
  }
  result.push(...ungroupedSessions(program));
  return result;
}

/** Done / total per group (a pick group counts as done when any alternative was done since the program's last full lap is unknown: we count distinct sessions done). */
export function groupProgress(program: UserProgram, groupId: string, recentWorkoutNames: readonly string[]): { done: number; total: number } {
  const done = lastDoneIndex(program, recentWorkoutNames);
  const sessions = sessionsInGroup(program, groupId);
  return { done: sessions.filter((session) => done.has(session.id)).length, total: sessions.length };
}

/** Rules that turn one week into the next. All optional; zero means "unchanged". */
export interface ProgressionRule {
  /** Added to every rep/second target each week. */
  targetStep: number;
  /** Added to every planned load each week (kg). */
  loadStep: number;
  /** When a rep target would pass this, add `loadStep` and reset to `resetTo` instead (double progression). Null: no cap. */
  targetCap: number | null;
  resetTo: number | null;
  /** 1-based index of the generated week that is a deload (sets cut by `deloadSetCut`, 0..1), or null. */
  deloadWeek: number | null;
  deloadSetCut: number;
}

export const DEFAULT_PROGRESSION: ProgressionRule = { targetStep: 1, loadStep: 0, targetCap: null, resetTo: null, deloadWeek: null, deloadSetCut: 0.4 };

/** The exercise one week later under `rule`. */
export function progressExercise(exercise: UserProgramExercise, rule: ProgressionRule, deload: boolean, newId: () => string): UserProgramExercise {
  let target = exercise.target;
  let loadKg = exercise.loadKg ?? null;
  if (target !== null && rule.targetStep) {
    const next = target + rule.targetStep;
    if (rule.targetCap !== null && next > rule.targetCap) {
      target = rule.resetTo ?? target;
      if (rule.loadStep) loadKg = (loadKg ?? 0) + rule.loadStep;
    } else target = next;
  } else if (rule.loadStep && loadKg !== null && rule.targetCap === null) loadKg += rule.loadStep;
  const sets = deload ? Math.max(1, Math.round(exercise.sets * (1 - rule.deloadSetCut))) : exercise.sets;
  return { ...exercise, id: newId(), target, loadKg, sets };
}

/**
 * Generates `weeks` new week groups after `sourceGroupId`, each a progressed copy of the previous one.
 * Returns the new groups and sessions to append; the source is left untouched.
 */
export function generateWeeks(
  program: UserProgram,
  sourceGroupId: string,
  weeks: number,
  rule: ProgressionRule,
  newId: () => string,
  nameFor: (index: number) => string,
): { groups: ProgramGroup[]; sessions: UserProgramSession[] } {
  const source = (program.groups ?? []).find((group) => group.id === sourceGroupId);
  if (!source) return { groups: [], sessions: [] };
  let previous = sessionsInGroup(program, sourceGroupId);
  const groups: ProgramGroup[] = [];
  const sessions: UserProgramSession[] = [];
  for (let week = 1; week <= weeks; week += 1) {
    const group: ProgramGroup = { id: newId(), name: nameFor(week), kind: source.kind, parentId: source.parentId ?? null };
    const deload = rule.deloadWeek === week;
    const made = previous.map((session) => ({
      ...session,
      id: newId(),
      groupId: group.id,
      exercises: session.exercises.map((exercise) => progressExercise(exercise, deload ? { ...rule, targetStep: 0, loadStep: 0 } : rule, deload, newId)),
    }));
    // A deload is a dip: the week after it continues from the last full week, sets restored.
    if (!deload) previous = made;
    groups.push(group);
    sessions.push(...made);
  }
  return { groups, sessions };
}

/** Copies a group (and its sessions) right after itself. */
export function duplicateGroup(program: UserProgram, groupId: string, newId: () => string, name: string): Pick<UserProgram, 'groups' | 'sessions'> {
  const groups = program.groups ?? [];
  const index = groups.findIndex((group) => group.id === groupId);
  if (index < 0) return { groups, sessions: program.sessions };
  const copy: ProgramGroup = { ...groups[index], id: newId(), name };
  const copies = sessionsInGroup(program, groupId).map((session) => ({ ...session, id: newId(), groupId: copy.id, exercises: session.exercises.map((exercise) => ({ ...exercise, id: newId() })) }));
  return { groups: [...groups.slice(0, index + 1), copy, ...groups.slice(index + 1)], sessions: [...program.sessions, ...copies] };
}

/** Removes a group: its sessions become ungrouped, its children move to the top level. */
export function removeGroup(program: UserProgram, groupId: string): Pick<UserProgram, 'groups' | 'sessions'> {
  return {
    groups: (program.groups ?? []).filter((group) => group.id !== groupId).map((group) => (group.parentId === groupId ? { ...group, parentId: null } : group)),
    sessions: program.sessions.map((session) => (session.groupId === groupId ? { ...session, groupId: null } : session)),
  };
}

/**
 * Quick-add line: "curl 3x10 @7 r90", "plank 3x30s", "trazioni 4x5 +10kg @8 r120".
 * Returns the exercise query and the parsed numbers; null when no "NxM" is present.
 */
export interface QuickAdd { query: string; sets: number; target: number; timed: boolean; rpe: number | null; restSeconds: number | null; loadKg: number | null }

export function parseQuickAdd(line: string): QuickAdd | null {
  const match = /(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(s|sec|")?/i.exec(line);
  if (!match || match.index === undefined) return null;
  const sets = Number(match[1]);
  const target = Number(match[2].replace(',', '.'));
  if (!Number.isInteger(sets) || sets < 1 || sets > 50 || !(target > 0)) return null;
  const rest = line.slice(match.index + match[0].length);
  const rpe = /@\s*(\d+(?:[.,]5)?)/.exec(rest);
  const restSec = /\br\s*(\d+)(?::(\d{2}))?/i.exec(rest);
  const load = /\+\s*(\d+(?:[.,]\d+)?)\s*kg/i.exec(rest);
  const rpeValue = rpe ? Number(rpe[1].replace(',', '.')) : null;
  return {
    query: line.slice(0, match.index).trim(),
    sets,
    target,
    timed: Boolean(match[3]),
    rpe: rpeValue !== null && rpeValue >= 1 && rpeValue <= 10 ? rpeValue : null,
    restSeconds: restSec ? (restSec[2] ? Number(restSec[1]) * 60 + Number(restSec[2]) : Number(restSec[1])) : null,
    loadKg: load ? Number(load[1].replace(',', '.')) : null,
  };
}

/** Working sets per category (e.g. push, pull, legs) across `sessions`; categories come from `categoriesOf`. */
export function setsByCategory(sessions: readonly Pick<UserProgramSession, 'exercises'>[], categoriesOf: (exerciseId: string) => readonly string[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      if (exercise.block === 'warmup' || exercise.block === 'mobility') continue;
      for (const category of categoriesOf(exercise.exerciseId)) totals.set(category, (totals.get(category) ?? 0) + exercise.sets);
    }
  }
  return totals;
}

/** Categories whose sets are under half the busiest one: worth a warning. */
export function lowCategories(totals: ReadonlyMap<string, number>): string[] {
  const max = Math.max(0, ...totals.values());
  return [...totals].filter(([, sets]) => max > 0 && sets < max / 2).map(([category]) => category);
}

/** Search and filter for the Programs list. */
export function filterPrograms<T extends Pick<UserProgram, 'name' | 'status'>>(programs: readonly T[], query: string, status: ProgramStatus | 'all'): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return programs.filter((program) => (status === 'all' || (program.status ?? 'active') === status) && (!needle || program.name.toLocaleLowerCase().includes(needle)));
}
