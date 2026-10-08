import { estimateOneRepMax } from './e1rm';
import { rpeToRir } from './rpe';

/** Reps beyond this make a one-rep-max estimate unreliable, so no estimate is made. */
export const ONE_RM_MAX_REPS = 12;

/**
 * Net load of a set in kg: the load added minus the help from bands (negative: still helped).
 * Null when bands helped but their kg are unknown, so the set has no comparable load.
 */
export function netLoadKg(addedLoadKg: number, assistKg: number | null | undefined, bandCount: number | undefined): number | null {
  if ((bandCount ?? 0) > 0) return assistKg == null ? null : addedLoadKg - assistKg;
  return addedLoadKg;
}

/**
 * One-rep max in kg of the effective load moved (bodyweight share, load added, minus band help).
 * With an RPE the reps in reserve count as reps done; without, the reps done. Null without a
 * positive load, with no reps, or beyond 12 reps.
 */
export function oneRepMaxEstimate(effectiveLoadKg: number | null | undefined, reps: number | null | undefined, rpe: number | null | undefined): number | null {
  if (effectiveLoadKg == null || !(effectiveLoadKg > 0) || reps == null || !(reps > 0)) return null;
  const reserve = rpe != null && rpe >= 6 && rpe <= 10 ? rpeToRir(rpe) : 0;
  const total = Math.round(reps + reserve);
  if (total < 1 || total > ONE_RM_MAX_REPS) return null;
  return estimateOneRepMax(effectiveLoadKg, total);
}
