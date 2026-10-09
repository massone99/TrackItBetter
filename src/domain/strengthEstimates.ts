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

export interface StrengthInput {
  /** What was done: reps, or a hold in seconds. */
  mode: 'reps' | 'hold';
  amount: number;
  /** Effort of the set, 6–10; null when not rated (then the reps done are the most that can be said). */
  rpe: number | null;
  /** Load added on top, kg (0 or more). */
  addedLoadKg: number;
  /** Help from bands or a counterweight, kg (0 or more). */
  assistKg: number;
  /** Bodyweight, and the share of it that is moved (0 for a barbell, about 1 for a pull-up). */
  bodyweightKg: number | null;
  bodyShare: number;
}

export interface StrengthEstimate {
  /** Load actually moved: share of the body + added − help; null when it is not positive. */
  effectiveLoadKg: number | null;
  /** Share of the body moved, kg. */
  bodyLoadKg: number;
  /** Added load minus help; negative: still helped. */
  netLoadKg: number;
  /** Most reps at this load, reps mode only. */
  maxReps: number | null;
  /** Longest hold at this load, hold mode only. */
  maxHoldSec: number | null;
  /** Estimated 1RM in kg of effective load, reps mode only. */
  oneRepMaxKg: number | null;
  /** The 1RM against the body: load that could be added (positive) or help still needed (negative); null without a body share. */
  vsBodyKg: number | null;
  /** Load for common rep counts, from the 1RM. */
  table: { reps: number; loadKg: number; vsBodyKg: number | null }[];
}

export const ESTIMATE_TABLE_REPS = [1, 3, 5, 8, 10, 12] as const;

/** Max reps or hold, 1RM and the load for common rep counts, from one set done at a known load. */
export function estimateStrength(input: StrengthInput): StrengthEstimate {
  const share = Math.min(1, Math.max(0, input.bodyShare));
  const bodyLoadKg = input.bodyweightKg != null && share > 0 ? input.bodyweightKg * share : 0;
  const netLoadKg = Math.round((input.addedLoadKg - input.assistKg) * 100) / 100;
  const moved = bodyLoadKg + netLoadKg;
  const effectiveLoadKg = moved > 0 ? Math.round(moved * 100) / 100 : null;
  const rated = input.rpe != null && input.rpe >= 6 && input.rpe <= 10;
  let maxReps: number | null = null;
  let maxHoldSec: number | null = null;
  let oneRepMaxKg: number | null = null;
  if (input.amount > 0) {
    if (input.mode === 'reps') {
      maxReps = input.amount + (rated ? rpeToRir(input.rpe!) : 0);
      oneRepMaxKg = oneRepMaxEstimate(effectiveLoadKg, input.amount, input.rpe);
    } else if (rated) {
      maxHoldSec = (input.amount * 10) / input.rpe!;
    } else {
      maxHoldSec = input.amount;
    }
  }
  const hasBody = bodyLoadKg > 0;
  const vsBodyKg = oneRepMaxKg !== null && hasBody ? Math.round((oneRepMaxKg - bodyLoadKg) * 10) / 10 : null;
  const table = oneRepMaxKg === null ? [] : ESTIMATE_TABLE_REPS.map((reps) => {
    const loadKg = reps === 1 ? oneRepMaxKg : oneRepMaxKg / (1 + reps / 30);
    return { reps, loadKg: Math.round(loadKg * 10) / 10, vsBodyKg: hasBody ? Math.round((loadKg - bodyLoadKg) * 10) / 10 : null };
  });
  return { effectiveLoadKg, bodyLoadKg, netLoadKg, maxReps, maxHoldSec, oneRepMaxKg, vsBodyKg, table };
}
