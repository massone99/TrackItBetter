import { groupSets } from '../../domain/setPairs';
/** How rest works inside a superset: none until the round ends, or a short rest between exercises. */
export interface SupersetRest { mode: 'round' | 'between'; betweenSec: number }

/** Stored in exercise_entry.group_type: "superset" or "superset:between:<seconds>". */
export function parseSupersetType(groupType: string | null): SupersetRest {
  const match = /^superset:between:(\d+)$/.exec(groupType ?? '');
  return match ? { mode: 'between', betweenSec: Number(match[1]) } : { mode: 'round', betweenSec: 0 };
}

export function formatSupersetType(rest: SupersetRest): string {
  return rest.mode === 'between' ? `superset:between:${Math.max(0, Math.round(rest.betweenSec))}` : 'superset';
}

interface GroupedExercise {
  entryId: string;
  groupId: string | null;
  groupType: string | null;
  sets: { completedAt: Date | null; pairId?: string | null }[];
}

export interface SupersetStep extends SupersetRest {
  /** Exercise to do next, or null when every set of the superset is done. */
  nextEntryId: string | null;
  /** True after the last exercise of a round: the full rest applies. */
  endOfRound: boolean;
}

/** What follows a set completed in `entryId`; null when that exercise is not in a superset. */
export function supersetStep(exercises: readonly GroupedExercise[], entryId: string): SupersetStep | null {
  const current = exercises.find((exercise) => exercise.entryId === entryId);
  if (!current?.groupId) return null;
  const group = exercises.filter((exercise) => exercise.groupId === current.groupId);
  const open = (exercise: GroupedExercise) => exercise.sets.some((set) => !set.completedAt);
  const rest = parseSupersetType(group[0].groupType);
  if (groupSets(current.sets).some((pair) => pair[0].pairId && pair.some((s) => s.completedAt) && pair.some((s) => !s.completedAt))) {
    return { nextEntryId: entryId, endOfRound: false, ...rest };
  }
  const later = group.slice(group.indexOf(current) + 1).find(open);
  if (later) return { nextEntryId: later.entryId, endOfRound: false, ...rest };
  return { nextEntryId: group.find(open)?.entryId ?? null, endOfRound: true, ...rest };
}
