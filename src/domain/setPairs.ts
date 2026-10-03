/** Pair identity, never adjacency or the current exercise flag, determines counting. */
export interface PairFields {
  pairId?: string | null;
  side?: string;
  entryId?: string;
  kind?: string;
  completedAt?: unknown;
}

export function groupSets<T extends PairFields>(rows: readonly T[]): T[][] {
  const result: T[][] = [];
  const pairs = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.pairId) { result.push([row]); continue; }
    let pair = pairs.get(row.pairId);
    if (!pair) { pair = []; pairs.set(row.pairId, pair); result.push(pair); }
    pair.push(row);
  }
  return result;
}

export function validatePairs<T extends PairFields>(rows: readonly T[], requireComplete = false): void {
  for (const pair of groupSets(rows)) {
    if (!pair[0].pairId) continue;
    if (pair.length !== 2 || !pair.some((s) => s.side === 'left') || !pair.some((s) => s.side === 'right')
      || pair.some((s) => s.entryId !== pair[0].entryId || s.kind !== pair[0].kind)) {
      throw new Error('Invalid unilateral pair');
    }
    if (requireComplete && pair.some((s) => !!s.completedAt) && !pair.every((s) => !!s.completedAt)) {
      throw new Error('Incomplete unilateral pair');
    }
  }
}

export function completedSetCount<T extends PairFields>(rows: readonly T[]): number {
  return groupSets(rows).filter((group) => group.every((s) => !!s.completedAt) && (!group[0].pairId || group.length === 2)).length;
}

/** Apply nonlinear metrics to the real sides FIRST, then average. Missing either value stays unknown. */
export function pairMean<T>(rows: readonly T[], metric: (row: T) => number | null | undefined): number | null {
  const values = rows.map(metric);
  return values.every((v): v is number => v != null && Number.isFinite(v))
    ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

export type PairScope = 'average' | 'left' | 'right' | 'legacy';

/** The original members remain available for derived metrics and comparability checks. */
export type Aggregated<T> = T & { pairMembers?: readonly T[] };

export function aggregatePairs<T extends PairFields>(rows: readonly T[], scope: PairScope = 'average'): Aggregated<T>[] {
  if (scope !== 'average') return rows.filter((row) => scope === 'legacy' ? !row.pairId && (!row.side || row.side === 'both') : row.side === scope).map((row) => ({ ...row, pairMembers: [row] }));
  return groupSets(rows).flatMap((group): Aggregated<T>[] => {
    const first = group[0] as Aggregated<T>;
    if (!first.pairId || first.pairMembers) return [first];
    if (group.length !== 2 || !group.some((s) => s.side === 'left') || !group.some((s) => s.side === 'right')) return [];
    if (group.some((s) => 'completedAt' in s && !s.completedAt)) return [];
    const result = { ...first, side: 'average', pairMembers: group };
    for (const key of ['reps', 'durationSec', 'distanceM', 'addedLoadKg', 'rpe', 'effectiveLoadKg', 'restBeforeSec']) {
      if (key in first) Object.assign(result, { [key]: pairMean(group, (s) => (s as Record<string, unknown>)[key] as number | null) });
    }
    return [result];
  });
}

export function realMean<T>(row: T & { pairMembers?: readonly T[] }, metric: (side: T) => number | null | undefined): number | null {
  return pairMean(row.pairMembers ?? [row], metric);
}

export function samePairValue<T>(row: T & { pairMembers?: readonly T[] }, metric: (side: T) => unknown): boolean {
  return !row.pairMembers || row.pairMembers.every((side) => metric(side) === metric(row.pairMembers![0]));
}

export function recordScope(row: PairFields): string { return row.pairId ? row.side ?? 'average' : row.side && row.side !== 'both' ? row.side : 'legacy'; }
