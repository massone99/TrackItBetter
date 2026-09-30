/**
 * Where a logged past workout starts by default: 18:00 on the chosen day (YYYY-MM-DD), else
 * yesterday. A start that has not happened yet is placed an hour ago instead.
 */
export function defaultPastStart(dateKey: string | null): Date {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const day = dateKey ? new Date(`${dateKey}T18:00:00`) : new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 18);
  return day.getTime() > Date.now() - 60 * 60_000 ? new Date(Date.now() - 60 * 60_000) : day;
}
