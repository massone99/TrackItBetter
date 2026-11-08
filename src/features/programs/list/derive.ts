import { groupProgress, PROGRAM_STATUSES, type ProgramStatus } from '../../../domain/programStructure';
import { nextSessionInRotation, programSessionWorkoutName, type UserProgram, type UserProgramSession } from '../../../domain/userProgram';

export type ProgramSort = 'recent' | 'name';

export const statusOf = (program: Pick<UserProgram, 'status'>): ProgramStatus => program.status ?? 'active';

/** How many programs sit in each status. */
export function statusCounts(programs: readonly UserProgram[]): Record<ProgramStatus, number> {
  const counts: Record<ProgramStatus, number> = { active: 0, paused: 0, archived: 0 };
  for (const program of programs) counts[statusOf(program)] += 1;
  return counts;
}

/** Statuses to offer as chips: Active always, the others only when something is in them. */
export function visibleStatuses(counts: Record<ProgramStatus, number>): ProgramStatus[] {
  return PROGRAM_STATUSES.filter((status) => status === 'active' || counts[status] > 0);
}

/** Last used first (never used last, by name), or by name. */
export function sortPrograms<T extends Pick<UserProgram, 'name' | 'lastUsedAt'>>(programs: readonly T[], sort: ProgramSort): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  return [...programs].sort(sort === 'name' ? byName : (a, b) => {
    const left = a.lastUsedAt ? Date.parse(a.lastUsedAt) : Number.NEGATIVE_INFINITY;
    const right = b.lastUsedAt ? Date.parse(b.lastUsedAt) : Number.NEGATIVE_INFINITY;
    return right === left ? byName(a, b) : right - left;
  });
}

/** Whole days between `iso` and `now` (0 = today); null without a date. */
export function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000));
}

/** Workouts of the program done at least once in the recent history, over all its workouts. */
export function programDone(program: UserProgram, recentNames: readonly string[]): { done: number; total: number } {
  const recent = new Set(recentNames);
  const sessions = program.sessions;
  return { done: sessions.filter((session) => recent.has(programSessionWorkoutName(program, session))).length, total: sessions.length };
}

/** The group (week, phase) a session sits in, with how far it is, for programs that use groups. */
export function currentGroupLabel(program: UserProgram, session: UserProgramSession | null, recentNames: readonly string[]): { name: string; done: number; total: number } | null {
  if (!session || !session.groupId || (program.layout ?? 'sequence') === 'sequence') return null;
  const group = (program.groups ?? []).find((item) => item.id === session.groupId);
  if (!group) return null;
  return { name: group.name, ...groupProgress(program, group.id, recentNames) };
}

/** The active program the person trained most recently, with its next workout; null when none was used yet. */
export function pickHero(programs: readonly UserProgram[], recentNames: readonly string[]): { program: UserProgram; next: UserProgramSession } | null {
  let best: { program: UserProgram; next: UserProgramSession; at: number } | null = null;
  for (const program of programs) {
    if (statusOf(program) !== 'active') continue;
    const next = nextSessionInRotation(program, recentNames);
    if (!next) continue;
    const at = program.lastUsedAt ? Date.parse(program.lastUsedAt) : Number.NaN;
    const used = Number.isFinite(at) ? at : programDone(program, recentNames).done > 0 ? 0 : null;
    if (used === null) continue;
    if (!best || used > best.at) best = { program, next, at: used };
  }
  return best ? { program: best.program, next: best.next } : null;
}
