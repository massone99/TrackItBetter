/** Rate of perceived exertion, logged in half steps from 6 (easy) to 10 (maximal effort). */
export const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

export function isValidRpe(value: unknown): value is number {
  return typeof value === 'number' && (RPE_VALUES as readonly number[]).includes(value);
}

/** Reps (or seconds of hold) left in reserve for an RPE: 10 → 0, 8 → 2. */
export function rpeToRir(rpe: number): number {
  if (!isValidRpe(rpe)) throw new RangeError('RPE must be between 6 and 10 in half steps');
  return 10 - rpe;
}

/** Mean RPE of the rated sets, rounded to one decimal; null when none were rated. */
export function averageRpe(values: readonly (number | null | undefined)[]): number | null {
  const rated = values.filter((value): value is number => typeof value === 'number');
  if (rated.length === 0) return null;
  return Math.round((rated.reduce((sum, value) => sum + value, 0) / rated.length) * 10) / 10;
}

export function formatRpe(rpe: number): string {
  return Number.isInteger(rpe) ? String(rpe) : rpe.toFixed(1);
}
