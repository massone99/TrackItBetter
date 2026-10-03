import { formatClock, formatNumber } from '../../shared/utils/format';

type SetValues = { pairId?: string | null; side?: string; kind?: string; reps: number | null; durationSec: number | null; distanceM: number | null; addedLoadKg: number };

/** One set as a short token: "8", "0:30", "40 m", "6×20 kg" or "W 5" for a warm-up. */
export function describeSetToken(set: SetValues, metric: string): string {
  const timed = metric === 'time' || metric === 'time_load';
  const value = timed ? formatClock(set.durationSec ?? 0) : metric === 'distance' ? `${formatNumber(set.distanceM ?? 0)} m` : String(set.reps ?? 0);
  const withLoad = set.addedLoadKg !== 0 ? `${value}×${formatNumber(set.addedLoadKg)} kg` : value;
  const label = set.side === 'left' ? 'L ' : set.side === 'right' ? 'R ' : '';
  return `${label}${set.kind === 'warmup' ? `W ${withLoad}` : withLoad}`;
}

/** A whole session on one line, sets separated by middots. */
export function describeSets(sets: readonly SetValues[], metric: string): string {
  return sets.map((set) => describeSetToken(set, metric)).join('  ·  ');
}
