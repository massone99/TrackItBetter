import type { SessionExercise, SessionSet } from './repository';
import type { SetKind } from './restDefaults';

/**
 * A micro-session is drafted in memory with the workout's own shapes, so it renders with the same
 * exercise card, and is written only when logged (see logMicroSessionItems).
 */
export type DraftExercise = SessionExercise;

type ExerciseInfo = { id: string; name: string; metric: string; demoUrl?: string | null };
type ValueField = 'reps' | 'durationSec' | 'distanceM' | 'addedLoadKg';

let counter = 0;
const localId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter += 1)}`;

/** The value field a metric logs: seconds for holds, metres for distance, reps otherwise. */
export function valueField(metric: string): 'reps' | 'durationSec' | 'distanceM' {
  return metric === 'time' || metric === 'time_load' ? 'durationSec' : metric === 'distance' ? 'distanceM' : 'reps';
}

/** An easy practice target: 10 s or 10 m for holds and distance, 3 reps otherwise. */
export function defaultTarget(metric: string): number {
  return valueField(metric) === 'reps' ? 3 : 10;
}

function newSet(metric: string, index: number, kind: SetKind, from?: SessionSet): SessionSet {
  const field = valueField(metric);
  return {
    id: localId('set'),
    index,
    kind,
    side: 'both',
    pairId: null,
    reps: field === 'reps' ? from?.reps ?? defaultTarget(metric) : null,
    durationSec: field === 'durationSec' ? from?.durationSec ?? defaultTarget(metric) : null,
    distanceM: field === 'distanceM' ? from?.distanceM ?? defaultTarget(metric) : null,
    addedLoadKg: from?.addedLoadKg ?? 0,
    restSec: null,
    rpe: null,
    targetRpe: null,
    formRating: null,
    note: null,
    clipCount: 0,
    completedAt: null,
  };
}

export function newDraftExercise(exercise: ExerciseInfo): DraftExercise {
  return {
    block: 'main',
    entryId: localId('entry'),
    exerciseId: exercise.id,
    name: exercise.name,
    metric: exercise.metric,
    demoUrl: exercise.demoUrl ?? null,
    notes: null,
    groupId: null,
    groupType: null,
    sets: [newSet(exercise.metric, 1, 'working')],
  };
}

const mapSets = (draft: DraftExercise[], entryId: string, change: (sets: SessionSet[], exercise: DraftExercise) => SessionSet[]) =>
  draft.map((exercise) => (exercise.entryId === entryId ? { ...exercise, sets: change(exercise.sets, exercise).map((set, index) => ({ ...set, index: index + 1 })) } : exercise));

/** A new set copies the last working set's values, like adding a set in a workout. */
export function addDraftSet(draft: DraftExercise[], entryId: string, kind: SetKind = 'working'): DraftExercise[] {
  return mapSets(draft, entryId, (sets, exercise) => {
    const last = [...sets].reverse().find((set) => set.kind === 'working');
    const added = newSet(exercise.metric, sets.length + 1, kind, kind === 'working' ? last : undefined);
    // Warm-ups go before the working sets.
    return kind === 'warmup' ? [added, ...sets] : [...sets, added];
  });
}

export function updateDraftSet(draft: DraftExercise[], setId: string, patch: Partial<SessionSet>): DraftExercise[] {
  return draft.map((exercise) => (exercise.sets.some((set) => set.id === setId)
    ? { ...exercise, sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...patch } : set)) }
    : exercise));
}

/** Steps a value, never below zero (load can be negative: assistance). */
export function stepDraftSet(draft: DraftExercise[], setId: string, field: ValueField, delta: number): DraftExercise[] {
  const set = draft.flatMap((exercise) => exercise.sets).find((item) => item.id === setId);
  if (!set) return draft;
  const current = field === 'addedLoadKg' ? set.addedLoadKg : set[field] ?? 0;
  const next = Number((current + delta).toFixed(2));
  return updateDraftSet(draft, setId, { [field]: field === 'addedLoadKg' ? next : Math.max(0, next) });
}

export function removeDraftSet(draft: DraftExercise[], setId: string): DraftExercise[] {
  return draft.map((exercise) => ({ ...exercise, sets: exercise.sets.filter((set) => set.id !== setId).map((set, index) => ({ ...set, index: index + 1 })) }));
}

/** The done sets per exercise, ready for logMicroSessionItems; exercises without one are left out. */
export function doneItems(draft: DraftExercise[]) {
  return draft.flatMap((exercise) => {
    const field = valueField(exercise.metric);
    const sets = exercise.sets.filter((set) => set.completedAt).map((set) => ({
      kind: set.kind,
      value: set[field] ?? 0,
      loadKg: field === 'distanceM' ? 0 : set.addedLoadKg,
      rpe: set.rpe,
      formRating: set.formRating,
    }));
    return sets.length ? [{ exerciseId: exercise.exerciseId, sets }] : [];
  });
}

/** After logging, the same exercises start again with one fresh set each, at the values just done. */
export function freshRound(draft: DraftExercise[]): DraftExercise[] {
  return draft.map((exercise) => {
    const last = [...exercise.sets].reverse().find((set) => set.kind === 'working');
    return { ...exercise, sets: [newSet(exercise.metric, 1, 'working', last)] };
  });
}
