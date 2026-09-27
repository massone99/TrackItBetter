/** Unit conversions used by domain calculations. Mass values are kilograms unless named otherwise. */
export const POUNDS_PER_KILOGRAM = 1 / 0.45359237;
export const KILOGRAMS_PER_POUND = 0.45359237;

export function kilogramsToPounds(kilograms: number): number {
  assertFinite(kilograms, 'kilograms');
  return kilograms * POUNDS_PER_KILOGRAM;
}

export function poundsToKilograms(pounds: number): number {
  assertFinite(pounds, 'pounds');
  return pounds * KILOGRAMS_PER_POUND;
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`);
  }
}
