import { groupTree, removeGroup, ungroupedSessions, type GroupKind, type ProgramGroup } from '../../../domain/programStructure';
import { programSessionWorkoutName, type UserProgram, type UserProgramSession } from '../../../domain/userProgram';

type Structure = Pick<UserProgram, 'groups' | 'sessions'>;

/** Ids of the workouts of this program that appear in `recentNames` (the finished history, by workout name). */
export function doneSessionIds(program: UserProgram, recentNames: readonly string[]): Set<string> {
  const names = new Set(recentNames);
  return new Set(program.sessions.filter((session) => names.has(programSessionWorkoutName(program, session))).map((session) => session.id));
}

/** A group (or the "Ungrouped" bucket, `group` null) with its workouts, its sub-groups and its progress. */
export interface SectionNode {
  id: string;
  group: ProgramGroup | null;
  sessions: UserProgramSession[];
  children: SectionNode[];
  /** Own workouts plus those of the sub-groups. */
  progress: { done: number; total: number };
  /** Holds the workout that comes next, directly or in a sub-group. */
  current: boolean;
}

export const UNGROUPED_ID = '__ungrouped__';

/** Sections in display order (`groupTree`), the ungrouped workouts last. One pass over the workouts, then one over the groups. */
export function buildSections(program: UserProgram, doneIds: ReadonlySet<string>, nextId: string | null): SectionNode[] {
  const groups = program.groups ?? [];
  const byGroup = new Map<string, UserProgramSession[]>();
  for (const session of program.sessions) {
    if (!session.groupId) continue;
    const list = byGroup.get(session.groupId);
    if (list) list.push(session); else byGroup.set(session.groupId, [session]);
  }
  const leaf = (group: ProgramGroup): SectionNode => {
    const sessions = byGroup.get(group.id) ?? [];
    return {
      id: group.id,
      group,
      sessions,
      children: [],
      progress: { done: sessions.filter((session) => doneIds.has(session.id)).length, total: sessions.length },
      current: sessions.some((session) => session.id === nextId),
    };
  };
  const nodes = groupTree(groups).map(({ group, children }) => {
    const node = leaf(group);
    node.children = children.map(leaf);
    for (const child of node.children) {
      node.progress = { done: node.progress.done + child.progress.done, total: node.progress.total + child.progress.total };
      node.current = node.current || child.current;
    }
    return node;
  });
  const loose = ungroupedSessions({ sessions: program.sessions, groups });
  if (loose.length > 0) {
    nodes.push({
      id: UNGROUPED_ID,
      group: null,
      sessions: loose,
      children: [],
      progress: { done: loose.filter((session) => doneIds.has(session.id)).length, total: loose.length },
      current: loose.some((session) => session.id === nextId),
    });
  }
  return nodes;
}

/** Switching to Weeks or Groups on a program without groups: one group holding every workout, so nothing disappears. */
export function withFirstGroup(program: UserProgram, name: string, newId: () => string): Structure | null {
  if (program.groups?.length) return null;
  const group: ProgramGroup = { id: newId(), name, kind: 'ordered', parentId: null };
  return { groups: [group], sessions: program.sessions.map((session) => ({ ...session, groupId: group.id })) };
}

export function addGroup(program: UserProgram, name: string, kind: GroupKind, newId: () => string): Structure {
  return { groups: [...(program.groups ?? []), { id: newId(), name: name.trim(), kind, parentId: null }], sessions: program.sessions };
}

export function editGroup(program: UserProgram, groupId: string, change: { name: string; kind: GroupKind }): Pick<UserProgram, 'groups'> {
  const name = change.name.trim();
  return { groups: (program.groups ?? []).map((group) => (group.id === groupId ? { ...group, name: name || group.name, kind: change.kind } : group)) };
}

/** Groups a group may sit inside: top-level ones other than itself, and none when it already holds sub-groups (two levels at most). */
export function parentOptions(groups: readonly ProgramGroup[], groupId: string): ProgramGroup[] {
  if (groups.some((group) => group.parentId === groupId)) return [];
  const ids = new Set(groups.map((group) => group.id));
  return groups.filter((group) => group.id !== groupId && (!group.parentId || !ids.has(group.parentId)));
}

export function setGroupParent(program: UserProgram, groupId: string, parentId: string | null): Pick<UserProgram, 'groups'> {
  const groups = program.groups ?? [];
  if (parentId !== null && !parentOptions(groups, groupId).some((group) => group.id === parentId)) return { groups };
  return { groups: groups.map((group) => (group.id === groupId ? { ...group, parentId } : group)) };
}

export function moveSessionToGroup(program: UserProgram, sessionId: string, groupId: string | null): Pick<UserProgram, 'sessions'> {
  return { sessions: program.sessions.map((session) => (session.id === sessionId ? { ...session, groupId } : session)) };
}

/** Groups as a flat list in display order with their depth (0 or 1), for pickers. */
export function flatGroups(groups: readonly ProgramGroup[]): { group: ProgramGroup; depth: number }[] {
  return groupTree(groups).flatMap(({ group, children }) => [{ group, depth: 0 }, ...children.map((child) => ({ group: child, depth: 1 }))]);
}

/** Workouts that sit directly in any of these groups. */
export function workoutsInGroups(program: Pick<UserProgram, 'sessions'>, ids: ReadonlySet<string>): UserProgramSession[] {
  return program.sessions.filter((session) => session.groupId != null && ids.has(session.groupId));
}

/**
 * Removes several groups at once (`removeGroup` for each). Their workouts become ungrouped, or are deleted
 * with them; sub-groups of a removed group that stay move to the top level, with their workouts.
 */
export function removeGroups(program: UserProgram, ids: ReadonlySet<string>, deleteWorkouts: boolean): Pick<UserProgram, 'groups' | 'sessions'> {
  const doomed = new Set(workoutsInGroups(program, ids).map((session) => session.id));
  let current: UserProgram = program;
  for (const id of ids) current = { ...current, ...removeGroup(current, id) };
  return { groups: current.groups ?? [], sessions: deleteWorkouts ? current.sessions.filter((session) => !doomed.has(session.id)) : current.sessions };
}
