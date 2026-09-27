/**
 * Calculates the load moved by a bodyweight exercise, including external weight.
 * A negative addedLoadKg represents assistance (for example, a counterweight).
 */
export function calculateEffectiveLoad(
  bodyweightKg: number,
  leverageFactor: number,
  addedLoadKg = 0,
): number {
  assertFinite(bodyweightKg, 'bodyweightKg');
  assertFinite(leverageFactor, 'leverageFactor');
  assertFinite(addedLoadKg, 'addedLoadKg');
  if (bodyweightKg < 0) throw new RangeError('bodyweightKg must be non-negative');
  if (leverageFactor < 0) throw new RangeError('leverageFactor must be non-negative');
  return bodyweightKg * leverageFactor + addedLoadKg;
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number`);
}
