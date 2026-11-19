import { newPrescription, estimateSessionSeconds, fitRpePerSet, isTimedMetric, type UserProgramExercise, type UserProgramSession } from '../../../domain/userProgram';
import { progressExercise, setsByCategory, lowCategories, type ProgressionRule, type QuickAdd } from '../../../domain/programStructure';

export interface BuilderExercise { id: string; name: string; metric: string; categories: string[] }

/** Main category plus the extra ones stored as a JSON array string. */
export function categoriesOfRow(row: { category: string; extraCategories?: string | null }): string[] {
  let extras: unknown = [];
  try { extras = JSON.parse(row.extraCategories ?? '[]'); } catch { extras = []; }
  return [...new Set([row.category, ...(Array.isArray(extras) ? extras.filter((item): item is string => typeof item === 'string') : [])])];
}

/** Best match for a typed name: exact, then starts-with, then contains (shortest name wins). Null when none. */
export function resolveExerciseQuery(query: string, exercises: Iterable<BuilderExercise>): BuilderExercise | null {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return null;
  let best: { exercise: BuilderExercise; rank: number } | null = null;
  for (const exercise of exercises) {
    const name = exercise.name.toLocaleLowerCase();
    const rank = name === needle ? 0 : name.startsWith(needle) ? 1 : name.includes(needle) ? 2 : -1;
    if (rank < 0) continue;
    if (!best || rank < best.rank || (rank === best.rank && name.length < best.exercise.name.length)) best = { exercise, rank };
  }
  return best?.exercise ?? null;
}

/** Quick-add result as a prescription; null when `s` (timed) is used on a non-timed exercise or the reverse. */
export function quickAddPrescription(quick: QuickAdd, exercise: BuilderExercise, newId: () => string): UserProgramExercise | null {
  if (quick.timed !== isTimedMetric(exercise.metric)) return null;
  const base = newPrescription(exercise.id, exercise.metric, newId);
  return {
    ...base,
    sets: quick.sets,
    target: quick.target,
    ...(quick.rpe !== null ? { rpe: quick.rpe } : {}),
    ...(quick.restSeconds !== null ? { restSeconds: quick.restSeconds } : {}),
    ...(quick.loadKg !== null && (exercise.metric === 'reps_load' || exercise.metric === 'time_load') ? { loadKg: quick.loadKg } : {}),
  };
}

export interface BulkChange { sets?: number; restSeconds?: number; rpe?: number | null }

export function applyBulk(exercise: UserProgramExercise, change: BulkChange): UserProgramExercise {
  let next = { ...exercise };
  if (change.sets !== undefined && exercise.totalTarget == null) {
    next = { ...next, sets: change.sets, ...(exercise.rpePerSet ? { rpePerSet: fitRpePerSet(exercise.rpePerSet, change.sets) } : {}) };
  }
  if (change.restSeconds !== undefined) next.restSeconds = change.restSeconds;
  if (change.rpe !== undefined) next = { ...next, rpe: change.rpe, rpePerSet: null };
  return next;
}

export interface Volume { byCategory: [string, number][]; low: string[]; seconds: number; sets: number }

export function volumeOf(
  sessions: readonly UserProgramSession[],
  info: ReadonlyMap<string, BuilderExercise>,
  defaultRest: number,
): Volume {
  const totals = setsByCategory(sessions, (id) => info.get(id)?.categories ?? []);
  const metricById = new Map([...info].map(([id, item]) => [id, item.metric]));
  const seconds = sessions.reduce((sum, session) => sum + estimateSessionSeconds(session, metricById, defaultRest), 0);
  const sets = [...totals.values()].reduce((sum, value) => sum + value, 0);
  return { byCategory: [...totals].sort((a, b) => b[1] - a[1]), low: lowCategories(totals), seconds, sets };
}

/** What the rule changes for one exercise after a normal week, e.g. "10 reps, 20 kg -> 11 reps, 20 kg". */
export function previewProgression(exercise: UserProgramExercise, rule: ProgressionRule): { before: UserProgramExercise; after: UserProgramExercise } {
  return { before: exercise, after: progressExercise(exercise, rule, false, () => exercise.id) };
}
