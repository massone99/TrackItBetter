import { groupProgress, PROGRAM_STATUSES, type ProgramStatus } from '../../../domain/programStructure';
import { disciplineOf, nextSessionInRotation, programSessionWorkoutName, type ProgramDiscipline, type UserProgram, type UserProgramSession } from '../../../domain/userProgram';

export const PROGRAM_SORTS = [
  'recent',
  'updated',
  'nameAsc',
  'nameDesc',
  'workoutsDesc',
  'workoutsAsc',
  'progress',
  'category',
  'author',
] as const;

export type ProgramSort = (typeof PROGRAM_SORTS)[number];

export function isProgramSort(value: unknown): value is ProgramSort {
  return typeof value === 'string' && (PROGRAM_SORTS as readonly string[]).includes(value);
}

export const statusOf = (program: Pick<UserProgram, 'status'>): ProgramStatus => program.status ?? 'active';

/** How many programs sit in each status. */
export function statusCounts(programs: readonly UserProgram[]): Record<ProgramStatus, number> {
  const counts: Record<ProgramStatus, number> = { active: 0, paused: 0, archived: 0 };
  for (const program of programs) counts[statusOf(program)] += 1;
  return counts;
}

function distinctValues<T>(items: readonly T[], pick: (item: T) => string | null | undefined): string[] {
  const unique = new Set<string>();
  for (const item of items) {
    const value = pick(item);
    if (value) unique.add(value);
  }
  return [...unique].sort((a, b) => a.localeCompare(b));
}

function valueCounts<T>(items: readonly T[], pick: (item: T) => string | null | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = pick(item);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** Unique non-empty categories across programs, sorted alphabetically. */
export const programCategories = (programs: readonly Pick<UserProgram, 'category'>[]): string[] =>
  distinctValues(programs, (program) => program.category);

/** How many programs belong to each category. */
export const categoryCounts = (programs: readonly Pick<UserProgram, 'category'>[]): Map<string, number> =>
  valueCounts(programs, (program) => program.category);

/** Unique non-empty authors across programs, sorted alphabetically. */
export const programAuthors = (programs: readonly Pick<UserProgram, 'author'>[]): string[] =>
  distinctValues(programs, (program) => program.author);

/** How many programs belong to each author. */
export const authorCounts = (programs: readonly Pick<UserProgram, 'author'>[]): Map<string, number> =>
  valueCounts(programs, (program) => program.author);

/** Unique non-empty custom clusters across programs and saved cluster definitions, sorted alphabetically. */
export function programClusters(
  programs: readonly Pick<UserProgram, 'clusters'>[],
  extraClusters: readonly string[] = [],
): string[] {
  const unique = new Set<string>(extraClusters);
  for (const program of programs) {
    for (const cluster of program.clusters ?? []) {
      if (cluster) unique.add(cluster);
    }
  }
  return [...unique].sort((a, b) => a.localeCompare(b));
}

/** How many programs belong to each custom cluster. */
export function clusterCounts(programs: readonly Pick<UserProgram, 'clusters'>[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const program of programs) {
    for (const cluster of program.clusters ?? []) {
      if (cluster) counts.set(cluster, (counts.get(cluster) ?? 0) + 1);
    }
  }
  return counts;
}

/** How many programs sit in each discipline (strength vs mobility). */
export function disciplineCounts(programs: readonly Pick<UserProgram, 'discipline' | 'category'>[]): Record<ProgramDiscipline, number> {
  const counts: Record<ProgramDiscipline, number> = { strength: 0, mobility: 0 };
  for (const program of programs) counts[disciplineOf(program)] += 1;
  return counts;
}

export interface ProgramClusterGroup<T> {
  cluster: string | null;
  programs: T[];
}

/** Groups programs by custom cluster (multi-membership), with unclustered programs in a trailing null group. */
export function groupProgramsByCluster<T extends Pick<UserProgram, 'clusters'>>(
  programs: readonly T[],
  clusterNames: readonly string[],
): ProgramClusterGroup<T>[] {
  const groups: ProgramClusterGroup<T>[] = [];
  for (const cluster of clusterNames) {
    const members = programs.filter((program) => program.clusters?.includes(cluster));
    if (members.length > 0) groups.push({ cluster, programs: members });
  }
  const unclustered = programs.filter((program) => !program.clusters || program.clusters.length === 0);
  if (unclustered.length > 0) groups.push({ cluster: null, programs: unclustered });
  return groups;
}

/** Statuses to offer as chips: Active always, the others only when something is in them. */
export function visibleStatuses(counts: Record<ProgramStatus, number>): ProgramStatus[] {
  return PROGRAM_STATUSES.filter((status) => status === 'active' || counts[status] > 0);
}

function parseIsoDesc(left: string | null | undefined, right: string | null | undefined): number {
  const a = left ? Date.parse(left) : Number.NEGATIVE_INFINITY;
  const b = right ? Date.parse(right) : Number.NEGATIVE_INFINITY;
  const safeA = Number.isFinite(a) ? a : Number.NEGATIVE_INFINITY;
  const safeB = Number.isFinite(b) ? b : Number.NEGATIVE_INFINITY;
  return safeB - safeA;
}

function compareOptionalLabel(left: string | null | undefined, right: string | null | undefined): number {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right);
}

/** Sorts programs by the chosen criterion; ties fall back to name A–Z. */
export function sortPrograms<T extends UserProgram>(
  programs: readonly T[],
  sort: ProgramSort,
  recentNames: readonly string[] = [],
): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const ratioOf = (program: T) => {
    if (program.sessions.length === 0) return -1;
    const { done, total } = programDone(program, recentNames);
    return total > 0 ? done / total : -1;
  };
  return [...programs].sort((a, b) => {
    switch (sort) {
      case 'nameAsc':
        return byName(a, b);
      case 'nameDesc':
        return byName(b, a);
      case 'updated':
        return parseIsoDesc(a.updatedAt, b.updatedAt) || byName(a, b);
      case 'workoutsDesc':
        return b.sessions.length - a.sessions.length || byName(a, b);
      case 'workoutsAsc':
        return a.sessions.length - b.sessions.length || byName(a, b);
      case 'progress': {
        const diff = ratioOf(b) - ratioOf(a);
        return diff !== 0 ? diff : byName(a, b);
      }
      case 'category':
        return compareOptionalLabel(a.category, b.category) || byName(a, b);
      case 'author':
        return compareOptionalLabel(a.author, b.author) || byName(a, b);
      case 'recent':
      default:
        return parseIsoDesc(a.lastUsedAt, b.lastUsedAt) || byName(a, b);
    }
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
