import { calculateEffectiveLoad } from './load';

export type OneRepMaxFormula = 'epley' | 'brzycki';

/** Estimate one-rep max in kg from a positive load and a completed rep count. */
export function estimateOneRepMax(
  loadKg: number,
  reps: number,
  formula: OneRepMaxFormula = 'epley',
): number {
  if (!Number.isFinite(loadKg) || loadKg <= 0) {
    throw new RangeError('loadKg must be a finite positive number');
  }
  if (!Number.isInteger(reps) || reps < 1) {
    throw new RangeError('reps must be a positive integer');
  }

  if (formula === 'epley') return loadKg * (1 + reps / 30);
  if (formula === 'brzycki') {
    if (reps > 36) throw new RangeError('Brzycki is defined here for 1 to 36 reps');
    return (loadKg * 36) / (37 - reps);
  }
  throw new RangeError(`Unsupported one-rep max formula: ${String(formula)}`);
}

/** Estimate a bodyweight exercise's e1RM using bodyweight × leverage + added load. */
export function estimateBodyweightInclusiveOneRepMax(
  bodyweightKg: number,
  leverageFactor: number,
  addedLoadKg: number,
  reps: number,
  formula: OneRepMaxFormula = 'epley',
): number {
  const effectiveLoadKg = calculateEffectiveLoad(bodyweightKg, leverageFactor, addedLoadKg);
  return estimateOneRepMax(effectiveLoadKg, reps, formula);
}
