export type PersonalRecordType = 'max_reps' | 'max_hold' | 'max_load' | 'e1rm' | 'volume';

export interface PersonalRecord {
  exerciseId: string;
  type: PersonalRecordType;
  value: number;
  setId?: string;
  achievedAt?: string;
}

/**
 * Returns at most one new record per exercise/type from a group of candidates.
 * Ties do not count as PRs; the highest candidate wins and must beat the saved best.
 */
export function detectPersonalRecords(
  candidates: readonly PersonalRecord[],
  previousRecords: readonly PersonalRecord[] = [],
): PersonalRecord[] {
  const previousBest = new Map<string, number>();
  for (const record of previousRecords) {
    assertRecord(record);
    const key = recordKey(record);
    const best = previousBest.get(key);
    if (best === undefined || record.value > best) previousBest.set(key, record.value);
  }

  const candidateBest = new Map<string, PersonalRecord>();
  for (const candidate of candidates) {
    assertRecord(candidate);
    const key = recordKey(candidate);
    const best = candidateBest.get(key);
    if (best === undefined || candidate.value > best.value) candidateBest.set(key, candidate);
  }

  return [...candidateBest.entries()]
    .filter(([key, candidate]) => candidate.value > (previousBest.get(key) ?? -Infinity))
    .map(([, candidate]) => candidate);
}

function recordKey(record: PersonalRecord): string {
  return `${record.exerciseId}\u0000${record.type}`;
}

function assertRecord(record: PersonalRecord): void {
  if (!record.exerciseId.trim()) throw new TypeError('exerciseId must not be empty');
  if (!Number.isFinite(record.value)) throw new RangeError('record value must be finite');
}
