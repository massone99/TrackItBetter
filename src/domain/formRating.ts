/** How clean a set was, from 1 to 5 in half steps. */
export const FORM_VALUES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const;

export function isValidFormRating(value: number): boolean {
  return Number.isFinite(value) && value >= 1 && value <= 5 && Number.isInteger(value * 2);
}
