export interface RecommendableRoutine {
  id: string;
  favourite: boolean;
  lastDoneAt?: string;
  updatedAt: string;
}

/** A routine run less than this long ago is not suggested again. */
export const RECENT_RUN_MS = 12 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The routine to suggest today: the one never run, else the one run longest ago. Ties go to a favourite,
 * then to the most recently edited. Null without routines, or when every one was run in the last 12 hours.
 */
export function recommendRoutine<T extends RecommendableRoutine>(routines: readonly T[], now: Date): T | null {
  const lastRun = (routine: T) => (routine.lastDoneAt ? Date.parse(routine.lastDoneAt) : -Infinity);
  const candidates = routines.filter((routine) => now.getTime() - lastRun(routine) >= RECENT_RUN_MS);
  const ranked = [...candidates].sort((a, b) => lastRun(a) - lastRun(b) || Number(b.favourite) - Number(a.favourite) || b.updatedAt.localeCompare(a.updatedAt));
  return ranked[0] ?? null;
}

/** Whole days since the routine was last run; null when it never was. */
export function daysSinceRun(routine: Pick<RecommendableRoutine, 'lastDoneAt'>, now: Date): number | null {
  if (!routine.lastDoneAt) return null;
  return Math.max(0, Math.floor((now.getTime() - Date.parse(routine.lastDoneAt)) / DAY_MS));
}
