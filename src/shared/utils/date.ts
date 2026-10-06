/** Local calendar day of a date as `YYYY-MM-DD` (not UTC, so late evenings stay on their day). */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Local midnight of a `YYYY-MM-DD` key; a `YYYY-MM` key gives the first of the month. */
export function dateFromKey(key: string): Date {
  const [year, month, day = 1] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}
