import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, max, ne, or } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db, initializeDatabase } from '../../db/client';
import { bumpFinishedVersion } from '../../db/cache';
import { bodyMeasurements, exerciseEntries, exercises, formCheckVideos, trainingSets, workouts } from '../../db/schema';
import { deleteFormCheckVideosForSets, deleteClipFilesIfUnused, releaseClipFiles, retainClipFiles } from '../media/formVideos';
import { countPoseCapturesBySet } from '../pose/repository';
import { isValidRpe } from '../../domain/rpe';
import { isLoadMetric, measureOf } from '../../domain/userProgram';
import type { SetKind } from './restDefaults';
import { formatSupersetType, type SupersetRest } from './superset';
import { groupSets, completedSetCount, validatePairs } from '../../domain/setPairs';
import { blockAfterMove, blockOf, sortByBlock, type Block } from '../../domain/blocks';

export interface SessionSet {
  pairId?: string | null;
  side?: string;
  id: string;
  index: number;
  /** Warm-ups stay out of statistics, records and previous values, and use their own rest. */
  kind: SetKind;
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
  addedLoadKg: number;
  restSec: number | null;
  /** Rate of perceived exertion, 6–10 in half steps. */
  rpe: number | null;
  /** RPE the program planned for this set, if any. */
  targetRpe: number | null;
  /** How clean the form of this set was, 1–5; null when not rated. */
  formRating: number | null;
  note: string | null;
  /** Number of form-check clips the user attached to this set. */
  clipCount: number;
  /** Number of pose analyses linked to this set. */
  poseCount?: number;
  completedAt: Date | null;
}

export interface SessionExercise {
  unilateral?: boolean;
  unilateralRestMode?: 'side' | 'pair';
  unilateralRestOverride?: 'side' | 'pair' | null;
  /** Part of the workout this exercise belongs to. */
  block: Block;
  entryId: string;
  exerciseId: string;
  name: string;
  metric: string;
  /** Link to a reference video showing good form, if one was attached to the exercise. */
  demoUrl: string | null;
  /** Free-text note for this exercise within the workout. */
  notes: string | null;
  /** Exercises sharing a group id form a superset; the type holds its rest mode (see superset.ts). */
  groupId: string | null;
  groupType: string | null;
  sets: SessionSet[];
}

export interface ActiveWorkout {
  id: string;
  name: string;
  /** Free-text note for the whole workout; starts as the prescribed workout's note. */
  notes: string | null;
  startedAt: Date;
  sleep: number | null;
  energy: number | null;
  soreness: number | null;
  exercises: SessionExercise[];
}

export interface WorkoutHistoryItem {
  id: string;
  name: string;
  startedAt: Date;
  endedAt: Date;
  setCount: number;
}

export interface CompletedWorkout extends ActiveWorkout {
  endedAt: Date;
}

const id = () => Crypto.randomUUID();

async function pairCondition(setId: string) {
  const [set] = await db.select().from(trainingSets).where(eq(trainingSets.id, setId));
  return set?.pairId ? eq(trainingSets.pairId, set.pairId) : eq(trainingSets.id, setId);
}

async function assertSetWorkout(setId: string, workoutId: string) {
  const [row] = await db.select({ workoutId: exerciseEntries.workoutId }).from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id)).where(eq(trainingSets.id, setId));
  if (row?.workoutId !== workoutId) throw new Error('Set does not belong to workout');
}

type WriteTarget = { workoutId: string } | { entryId: string } | { setId: string };

/** Whether the workout a row belongs to is finished; false when the row does not exist. */
async function isFinished(target: WriteTarget): Promise<boolean> {
  if ('workoutId' in target) {
    const [row] = await db.select({ endedAt: workouts.endedAt }).from(workouts).where(eq(workouts.id, target.workoutId)).limit(1);
    return Boolean(row?.endedAt);
  }
  if ('entryId' in target) {
    const [row] = await db.select({ endedAt: workouts.endedAt }).from(exerciseEntries)
      .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id)).where(eq(exerciseEntries.id, target.entryId)).limit(1);
    return Boolean(row?.endedAt);
  }
  const [row] = await db.select({ endedAt: workouts.endedAt }).from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id)).where(eq(trainingSets.id, target.setId)).limit(1);
  return Boolean(row?.endedAt);
}

/**
 * Call after a write that may have changed a finished workout: history caches (records, analytics)
 * reload only then, so logging sets in the workout in progress does not rescan the whole history.
 */
async function bumpIfFinished(target: WriteTarget): Promise<void> {
  if (await isFinished(target)) bumpFinishedVersion();
}

async function requireActiveSet(setId: string) {
  const [row] = await db.select({ endedAt: workouts.endedAt }).from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id)).where(eq(trainingSets.id, setId));
  if (!row || row.endedAt) throw new Error('Use the completed workout editor');
}

export async function setUnilateralRest(entryId: string, mode: 'side' | 'pair' | null, habitual = false): Promise<void> {
  await initializeDatabase();
  const [entry] = await db.select().from(exerciseEntries).where(eq(exerciseEntries.id, entryId));
  if (!entry) throw new Error('Exercise not found');
  if (mode !== null && mode !== 'side' && mode !== 'pair') throw new Error('Invalid rest mode');
  await db.transaction(async (tx) => {
    if (habitual && mode) await tx.update(exercises).set({ unilateralRestMode: mode }).where(eq(exercises.id, entry.exerciseId));
    await tx.update(exerciseEntries).set({ unilateralRestMode: habitual ? null : mode }).where(eq(exerciseEntries.id, entryId));
  });
}

export type PairEditValues = Pick<SessionSet, 'reps' | 'durationSec' | 'distanceM' | 'addedLoadKg' | 'rpe'>;

type SetValueField = 'reps' | 'durationSec' | 'distanceM' | 'addedLoadKg';
const SET_VALUE_FIELDS = ['reps', 'durationSec', 'distanceM', 'addedLoadKg'] as const;

/** Reps and seconds are whole and not negative, distance is not negative; load may be negative (assistance). */
function isValidSetValue(field: SetValueField, value: number): boolean {
  return Number.isFinite(value) && (field === 'addedLoadKg' || value >= 0) && ((field !== 'reps' && field !== 'durationSec') || Number.isInteger(value));
}

function validatePairValues(left: PairEditValues, right: PairEditValues) {
  for (const values of [left, right]) {
    for (const field of SET_VALUE_FIELDS) {
      const v = values[field];
      if (v !== null && !isValidSetValue(field, v)) throw new Error('Invalid set value');
    }
    if (values.rpe !== null && !isValidRpe(values.rpe)) throw new Error('Invalid RPE');
  }
}

/** Writes one value column of a set (already validated). */
async function writeSetValue(setId: string, field: SetValueField | 'restSec', value: number): Promise<void> {
  await db.update(trainingSets).set({ [field]: value }).where(eq(trainingSets.id, setId));
}

export async function addCompletedPair(workoutId: string, entryId: string, left: PairEditValues, right: PairEditValues): Promise<string> {
  await initializeDatabase();
  await completedWorkoutEnd(workoutId);
  const [entry] = await db.select().from(exerciseEntries).where(eq(exerciseEntries.id, entryId));
  if (entry?.workoutId !== workoutId) throw new Error('Exercise does not belong to workout');
  validatePairValues(left, right);
  return addSet(entryId, { left, right });
}

/** Explicit conversion preserves the original row id (and therefore its note and videos). */
export async function saveCompletedPair(workoutId: string, setId: string, originalSide: 'left' | 'right', left: PairEditValues, right: PairEditValues, otherSetId?: string): Promise<void> {
  await initializeDatabase();
  const endedAt = await completedWorkoutEnd(workoutId);
  await assertSetWorkout(setId, workoutId);
  validatePairValues(left, right);
  await db.transaction(async (tx) => {
    const [original] = await tx.select().from(trainingSets).where(eq(trainingSets.id, setId));
    const pairId = original.pairId ?? id();
    const side = original.pairId ? original.side : originalSide;
    const other = original.pairId ? (await tx.select().from(trainingSets).where(eq(trainingSets.pairId, pairId))).find((s) => s.id !== setId)
      : otherSetId ? (await tx.select().from(trainingSets).where(eq(trainingSets.id, otherSetId)))[0] : null;
    if (otherSetId && (!other || other.id === original.id || other.entryId !== original.entryId || other.kind !== original.kind || other.pairId)) throw new Error('Invalid legacy pair association');
    await tx.update(trainingSets).set({ ...(side === 'left' ? left : right), side, pairId, completedAt: endedAt }).where(eq(trainingSets.id, setId));
    const values = { ...(side === 'left' ? right : left), side: side === 'left' ? 'right' : 'left', pairId, index: original.index, completedAt: endedAt };
    if (other) await tx.update(trainingSets).set(values).where(eq(trainingSets.id, other.id));
    else await tx.insert(trainingSets).values({ ...original, ...values, id: id(), pairId, note: null });
    if (otherSetId) {
      const rows = await tx.select().from(trainingSets).where(eq(trainingSets.entryId, original.entryId)).orderBy(asc(trainingSets.index));
      for (const [position, group] of groupSets(rows).entries()) {
        for (const row of group) await tx.update(trainingSets).set({ index: position + 1 }).where(eq(trainingSets.id, row.id));
      }
    }
  });
  bumpFinishedVersion();
}

/** The latest logged bodyweight in kg, which a new workout keeps for bodyweight-relative loads. */
async function latestBodyweightKg(): Promise<number | null> {
  const [latest] = await db
    .select({ value: bodyMeasurements.value, unit: bodyMeasurements.unit })
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.kind, 'weight'))
    .orderBy(desc(bodyMeasurements.measuredAt))
    .limit(1);
  return latest ? latest.unit === 'lb' ? latest.value * 0.45359237 : latest.value : null;
}

export async function startWorkout(name = 'Workout', notes?: string | null): Promise<string> {
  await initializeDatabase();
  const workoutId = id();
  await db.insert(workouts).values({ id: workoutId, name, notes: notes?.trim() || null, startedAt: new Date(), bodyweightKg: await latestBodyweightKg() });
  return workoutId;
}

/** Renames the workout being done and edits its notes; the prescribed workout in the program is untouched. */
export async function updateWorkoutDetails(workoutId: string, details: { name: string; notes: string }): Promise<void> {
  await initializeDatabase();
  const name = details.name.trim();
  if (!name) throw new Error('A workout needs a name.');
  await db.update(workouts).set({ name, notes: details.notes.trim().slice(0, 1000) || null }).where(eq(workouts.id, workoutId));
  await bumpIfFinished({ workoutId });
}

export async function getActiveWorkout(id?: string): Promise<ActiveWorkout | null> {
  await initializeDatabase();
  const [workout] = await db
    .select()
    .from(workouts)
    .where(id ? eq(workouts.id, id) : isNull(workouts.endedAt))
    .orderBy(desc(workouts.startedAt))
    .limit(1);
  if (!workout || workout.endedAt) return null;

  const sessionExercises = await loadSessionExercises(workout.id);

  return {
    id: workout.id,
    name: workout.name,
    notes: workout.notes,
    startedAt: workout.startedAt,
    sleep: workout.sleep,
    energy: workout.energy,
    soreness: workout.soreness,
    exercises: sessionExercises,
  };
}

export async function updateWorkoutReadiness(
  workoutId: string,
  field: 'sleep' | 'energy' | 'soreness',
  value: number,
): Promise<void> {
  await initializeDatabase();
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new RangeError('Readiness ratings must be integers from 1 to 5');
  }
  await db.update(workouts).set({ [field]: value }).where(and(eq(workouts.id, workoutId), isNull(workouts.endedAt)));
}

async function loadSessionExercises(workoutId: string): Promise<SessionExercise[]> {
  const entries = await db
    .select({ entry: exerciseEntries, exercise: exercises })
    .from(exerciseEntries)
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id))
    .where(eq(exerciseEntries.workoutId, workoutId))
    .orderBy(asc(exerciseEntries.order));
  const clipRows = await db
    .select({ setId: formCheckVideos.setId, value: count(formCheckVideos.id) })
    .from(formCheckVideos)
    .where(eq(formCheckVideos.workoutId, workoutId))
    .groupBy(formCheckVideos.setId);
  const clipsBySet = new Map(clipRows.map((row) => [row.setId, row.value]));
  const posesBySet = await countPoseCapturesBySet(workoutId);

  // One query for every set of the workout, grouped by entry, instead of one query per exercise.
  const setRows = entries.length === 0 ? [] : await db.select().from(trainingSets)
    .where(inArray(trainingSets.entryId, entries.map(({ entry }) => entry.id))).orderBy(asc(trainingSets.index));
  const setsByEntry = new Map<string, (typeof setRows)[number][]>();
  for (const set of setRows) {
    const list = setsByEntry.get(set.entryId);
    if (list) list.push(set);
    else setsByEntry.set(set.entryId, [set]);
  }

  return entries.map(({ entry, exercise }) => {
    const sets = setsByEntry.get(entry.id) ?? [];
    return {
      entryId: entry.id,
      exerciseId: exercise.id,
      name: exercise.name,
      metric: exercise.metric,
      unilateral: exercise.unilateral,
      unilateralRestMode: entry.unilateralRestMode ?? exercise.unilateralRestMode,
      unilateralRestOverride: entry.unilateralRestMode,
      demoUrl: exercise.demoUrl,
      notes: entry.notes,
      block: blockOf(entry.block),
      groupId: entry.groupId,
      groupType: entry.groupType,
      sets: sets.map((set) => ({
        id: set.id,
        pairId: set.pairId,
        side: set.side,
        index: set.index,
        kind: set.kind === 'warmup' ? 'warmup' as const : 'working' as const,
        reps: set.reps,
        durationSec: set.durationSec,
        distanceM: set.distanceM,
        addedLoadKg: set.addedLoadKg,
        restSec: set.restSec,
        rpe: set.rpe,
        targetRpe: set.targetRpe,
        formRating: set.formRating,
        note: set.note,
        clipCount: clipsBySet.get(set.id) ?? 0,
        poseCount: posesBySet.get(set.id) ?? 0,
        completedAt: set.completedAt,
      })),
    };
  });
}

/** Read a finished workout for review/editing without reopening its lifecycle. */
export async function getCompletedWorkout(workoutId: string): Promise<CompletedWorkout | null> {
  await initializeDatabase();
  const [workout] = await db.select().from(workouts).where(eq(workouts.id, workoutId)).limit(1);
  if (!workout?.endedAt) return null;

  const sessionExercises = await loadSessionExercises(workout.id);

  return {
    id: workout.id,
    name: workout.name,
    notes: workout.notes,
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
    sleep: workout.sleep,
    energy: workout.energy,
    soreness: workout.soreness,
    exercises: sessionExercises,
  };
}

/** Update a set only when it belongs to a finished workout. Its completion time and
 * workout endedAt are deliberately untouched, so an edit cannot resume a session. */
export async function updateCompletedWorkoutSet(
  workoutId: string,
  setId: string,
  field: 'reps' | 'durationSec' | 'distanceM' | 'addedLoadKg',
  value: number,
): Promise<void> {
  await initializeDatabase();
  if (!isValidSetValue(field, value)) throw new Error('Invalid workout set value');
  const [row] = await db.select({ workoutId: exerciseEntries.workoutId, endedAt: workouts.endedAt })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(eq(trainingSets.id, setId)).limit(1);
  if (!row || row.workoutId !== workoutId || !row.endedAt) {
    throw new Error('Set does not belong to a completed workout');
  }
  await writeSetValue(setId, field, field === 'distanceM' ? Math.round(value * 100) / 100 : value);
  bumpFinishedVersion();
}

export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string,
): Promise<string> {
  await initializeDatabase();
  const [lastOrder] = await db
    .select({ value: max(exerciseEntries.order) })
    .from(exerciseEntries)
    .where(eq(exerciseEntries.workoutId, workoutId));
  const entryId = id();
  // A mobility exercise joining a workout of other exercises goes to the mobility block (changeable in its options).
  const [added] = await db.select({ category: exercises.category, extra: exercises.extraCategories }).from(exercises).where(eq(exercises.id, exerciseId)).limit(1);
  const others = await db.select({ category: exercises.category, extra: exercises.extraCategories }).from(exerciseEntries)
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id)).where(eq(exerciseEntries.workoutId, workoutId));
  const isMobility = (row?: { category: string; extra: string }) => !!row && (row.category === 'mobility' || row.extra.includes('"mobility"'));
  const block: Block | null = isMobility(added) && others.some((row) => !isMobility(row)) ? 'mobility' : null;
  await db.insert(exerciseEntries).values({
    id: entryId,
    workoutId,
    exerciseId,
    order: (lastOrder?.value ?? 0) + 1,
    block,
  });
  await normalizeBlockOrder(workoutId);
  await addSet(entryId);
  return entryId;
}

/** Renumbers a workout's exercises so every block is contiguous (warm-up, main work, mobility). */
async function normalizeBlockOrder(workoutId: string): Promise<void> {
  const entries = await db.select().from(exerciseEntries).where(eq(exerciseEntries.workoutId, workoutId)).orderBy(asc(exerciseEntries.order));
  const sorted = sortByBlock(entries);
  await db.transaction(async (tx) => {
    for (const [position, entry] of sorted.entries()) {
      if (entry.order !== position + 1) await tx.update(exerciseEntries).set({ order: position + 1 }).where(eq(exerciseEntries.id, entry.id));
    }
  });
}

/** Puts an exercise in a block of its workout; the exercises are kept grouped by block. */
export async function setEntryBlock(entryId: string, block: Block): Promise<void> {
  await initializeDatabase();
  const [entry] = await db.select().from(exerciseEntries).where(eq(exerciseEntries.id, entryId));
  if (!entry) throw new Error('Exercise not found');
  const stored = block === 'main' ? null : block;
  if ((entry.block ?? null) === stored) return;
  await db.update(exerciseEntries).set({ block: stored }).where(eq(exerciseEntries.id, entryId));
  await normalizeBlockOrder(entry.workoutId);
  await splitBrokenSuperset(entry.workoutId, entryId);
  await bumpIfFinished({ workoutId: entry.workoutId });
}

/** A superset must stay contiguous: an exercise moved out of its run leaves the superset. */
async function splitBrokenSuperset(workoutId: string, movedId: string): Promise<void> {
  const entries = await db.select().from(exerciseEntries).where(eq(exerciseEntries.workoutId, workoutId)).orderBy(asc(exerciseEntries.order));
  const moved = entries.find((entry) => entry.id === movedId);
  if (!moved?.groupId) return;
  const members = entries.filter((entry) => entry.groupId === moved.groupId);
  const positions = members.map((entry) => entries.indexOf(entry));
  if (positions[positions.length - 1] - positions[0] === members.length - 1) return;
  await db.update(exerciseEntries).set({ groupId: null, groupType: null }).where(eq(exerciseEntries.id, movedId));
  const rest = members.filter((entry) => entry.id !== movedId);
  if (rest.length === 1) await db.update(exerciseEntries).set({ groupId: null, groupType: null }).where(eq(exerciseEntries.id, rest[0].id));
}

export async function addSet(entryId: string, pairValues?: { left: PairEditValues; right: PairEditValues }): Promise<string> {
  await initializeDatabase();
  if (pairValues) validatePairValues(pairValues.left, pairValues.right);
  const [entryExercise] = await db
    .select({ metric: exercises.metric, unilateral: exercises.unilateral, endedAt: workouts.endedAt })
    .from(exerciseEntries)
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(eq(exerciseEntries.id, entryId))
    .limit(1);
  const [previous] = await db
    .select()
    .from(trainingSets)
    .where(eq(trainingSets.entryId, entryId))
    .orderBy(desc(trainingSets.index))
    .limit(1);
  const setId = id();
  const initialValue = entryExercise?.metric === 'time' || entryExercise?.metric === 'time_load'
    ? { durationSec: 10 }
    : entryExercise?.metric === 'distance'
      ? { distanceM: 10 }
      : { reps: 8 };
  const values = {
    id: setId,
    entryId,
    index: (previous?.index ?? 0) + 1,
    kind: previous?.kind ?? 'working',
    reps: previous?.reps ?? ('reps' in initialValue ? initialValue.reps : null),
    durationSec: previous?.durationSec ?? ('durationSec' in initialValue ? initialValue.durationSec : null),
    distanceM: previous?.distanceM ?? ('distanceM' in initialValue ? initialValue.distanceM : null),
    addedLoadKg: previous?.addedLoadKg ?? 0,
    restSec: previous?.restSec ?? null,
    band: previous?.band ?? null,
    rpe: previous?.rpe ?? null,
    targetRpe: previous?.targetRpe ?? null,
    side: 'both',
    note: previous?.note ?? null,
    completedAt: entryExercise?.endedAt ?? null,
  };
  await db.transaction(async (tx) => {
    if (entryExercise?.unilateral || pairValues) {
      const pairId = id();
      const prior = previous?.pairId ? await tx.select().from(trainingSets).where(eq(trainingSets.pairId, previous.pairId)) : [];
      await tx.insert(trainingSets).values(['left', 'right'].map((side, position) => {
        const source = prior.find((s) => s.side === side);
        return { ...values, ...(source ? { reps: source.reps, durationSec: source.durationSec, distanceM: source.distanceM, addedLoadKg: source.addedLoadKg, rpe: source.rpe, note: source.note } : {}), ...(pairValues ? pairValues[side as 'left' | 'right'] : {}), id: position === 0 ? setId : id(), side, pairId };
      }));
    } else await tx.insert(trainingSets).values(values);
  });
  if (entryExercise?.endedAt) bumpFinishedVersion();
  return setId;
}

export async function updateSet(
  setId: string,
  field: 'reps' | 'durationSec' | 'distanceM' | 'addedLoadKg' | 'restSec',
  value: number,
): Promise<void> {
  await initializeDatabase();
  if (field === 'restSec' && (!Number.isInteger(value) || value < 0 || value > 3600)) {
    throw new RangeError('Rest time must be an integer between 0 and 3600 seconds.');
  }
  if (field !== 'restSec' && !isValidSetValue(field, value)) throw new Error('Invalid workout set value');
  await writeSetValue(setId, field, value);
  await bumpIfFinished({ setId });
}

export async function completeSet(setId: string): Promise<void> {
  await initializeDatabase();
  await requireActiveSet(setId);
  await db.update(trainingSets).set({ completedAt: new Date() }).where(eq(trainingSets.id, setId));
}

/** Rounds of an EMOM already recorded: completed working sets of the entry since round 1 began (a pair counts once). */
export async function countEmomRounds(entryId: string, since: Date): Promise<number> {
  await initializeDatabase();
  const rows = await db.select({ id: trainingSets.id, pairId: trainingSets.pairId }).from(trainingSets)
    .where(and(eq(trainingSets.entryId, entryId), eq(trainingSets.kind, 'working'), gte(trainingSets.completedAt, since)));
  return new Set(rows.map((row) => row.pairId ?? row.id)).size;
}

/**
 * Records one EMOM round as a completed working set at the round's end: the next planned set of the
 * exercise not done yet is used first, otherwise a new set (a left/right pair when unilateral) is added.
 */
export async function recordEmomRound(entryId: string, field: 'reps' | 'durationSec', value: number, at: Date): Promise<void> {
  await initializeDatabase();
  if (!Number.isInteger(value) || value < 0) throw new Error('Invalid workout set value');
  const [entry] = await db.select({ endedAt: workouts.endedAt }).from(exerciseEntries)
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id)).where(eq(exerciseEntries.id, entryId));
  if (!entry || entry.endedAt) throw new Error('Use the completed workout editor');
  const sets = await db.select().from(trainingSets).where(eq(trainingSets.entryId, entryId)).orderBy(asc(trainingSets.index));
  // Only sets after the last completed one: a gap left by hand is never filled with a later round.
  const groups = groupSets(sets);
  const lastDone = groups.reduce((last, group, index) => (group.some((set) => set.completedAt) ? index : last), -1);
  const open = groups.slice(lastDone + 1).find((group) => group[0].kind === 'working' && group.every((set) => !set.completedAt));
  const ids = open ? open.map((set) => set.id) : await (async () => {
    const created = await addSet(entryId);
    const [first] = await db.select({ pairId: trainingSets.pairId }).from(trainingSets).where(eq(trainingSets.id, created));
    return first?.pairId
      ? (await db.select({ id: trainingSets.id }).from(trainingSets).where(eq(trainingSets.pairId, first.pairId))).map((row) => row.id)
      : [created];
  })();
  await db.update(trainingSets)
    .set({ ...(field === 'reps' ? { reps: value } : { durationSec: value }), kind: 'working', completedAt: at })
    .where(inArray(trainingSets.id, ids));
}

/** A workout cannot finish with one side of an L/R pair done and the other not; the UI words it. */
export class IncompletePairError extends Error {
  constructor(readonly exerciseName: string, readonly setIndex: number, readonly side: 'left' | 'right') {
    super(`${exerciseName} · set ${setIndex}: ${side} side missing`);
    this.name = 'IncompletePairError';
  }
}

export async function finishWorkout(workoutId: string): Promise<void> {
  await initializeDatabase();
  const session = await loadSessionExercises(workoutId);
  for (const exercise of session) {
    validatePairs(exercise.sets);
    for (const pair of groupSets(exercise.sets)) {
      if (pair[0].pairId && pair.some((s) => s.completedAt) && !pair.every((s) => s.completedAt)) {
        const missing = pair.find((s) => !s.completedAt)!;
        throw new IncompletePairError(exercise.name, pair[0].index, missing.side === 'left' ? 'left' : 'right');
      }
    }
  }
  await db
    .update(workouts)
    .set({ endedAt: new Date() })
    .where(and(eq(workouts.id, workoutId), isNull(workouts.endedAt)));
  bumpFinishedVersion();
}

/**
 * Deletes a workout (in progress or finished) with its exercises, sets and form-check clips. Used
 * both to discard a session that should not count and to remove a logged one from history.
 */
export async function deleteWorkout(workoutId: string): Promise<void> {
  await initializeDatabase();
  const sets = await db.select({ id: trainingSets.id })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .where(eq(exerciseEntries.workoutId, workoutId));
  await deleteFormCheckVideosForSets(sets.map((set) => set.id));
  await db.transaction(async (tx) => {
    const entries = await tx.select({ id: exerciseEntries.id }).from(exerciseEntries).where(eq(exerciseEntries.workoutId, workoutId));
    if (entries.length > 0) await tx.delete(trainingSets).where(inArray(trainingSets.entryId, entries.map((entry) => entry.id)));
    await tx.delete(exerciseEntries).where(eq(exerciseEntries.workoutId, workoutId));
    await tx.delete(workouts).where(eq(workouts.id, workoutId));
  });
  bumpFinishedVersion();
}

export const WORKOUT_NAME_MAX = 60;

/** Renames a finished workout and moves its start and end, keeping it finished. */
export async function updateCompletedWorkoutDetails(
  workoutId: string,
  details: { name: string; startedAt: Date; endedAt: Date },
): Promise<void> {
  const name = details.name.trim();
  if (!name || name.length > WORKOUT_NAME_MAX) throw new RangeError('Workout name must be 1–60 characters');
  const start = details.startedAt.getTime();
  const end = details.endedAt.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new RangeError('A workout must end after it starts');
  if (start > Date.now()) throw new RangeError('A finished workout cannot start in the future');
  await initializeDatabase();
  await db.update(workouts)
    .set({ name, startedAt: details.startedAt, endedAt: details.endedAt })
    .where(and(eq(workouts.id, workoutId), isNotNull(workouts.endedAt)));
  bumpFinishedVersion();
}

/**
 * Creates an empty, already finished workout in the past (a forgotten or untracked session), to be
 * filled in with the history editor.
 */
export async function createPastWorkout(input: { name: string; startedAt: Date; minutes: number }): Promise<string> {
  const name = input.name.trim();
  if (!name || name.length > WORKOUT_NAME_MAX) throw new RangeError('Workout name must be 1–60 characters');
  const start = input.startedAt.getTime();
  if (!Number.isFinite(start) || start > Date.now()) throw new RangeError('A past workout cannot start in the future');
  const minutes = Math.min(600, Math.max(1, Math.round(input.minutes)));
  await initializeDatabase();
  const workoutId = id();
  await db.insert(workouts).values({ id: workoutId, name, startedAt: input.startedAt, endedAt: new Date(start + minutes * 60_000) });
  bumpFinishedVersion();
  return workoutId;
}

/**
 * Turns a workout just built from a template into a finished one in the past: it gets its start
 * and end, and every set counts as done at the end. Used to log a program workout after the fact.
 */
export async function convertToPastWorkout(workoutId: string, startedAt: Date, minutes: number): Promise<void> {
  const start = startedAt.getTime();
  if (!Number.isFinite(start) || start > Date.now()) throw new RangeError('A past workout cannot start in the future');
  const endedAt = new Date(start + Math.min(600, Math.max(1, Math.round(minutes))) * 60_000);
  await initializeDatabase();
  await db.transaction(async (tx) => {
    const entries = await tx.select({ id: exerciseEntries.id }).from(exerciseEntries).where(eq(exerciseEntries.workoutId, workoutId));
    if (entries.length > 0) {
      const sets = await tx.select().from(trainingSets).where(inArray(trainingSets.entryId, entries.map((entry) => entry.id)));
      validatePairs(sets);
      await tx.update(trainingSets).set({ completedAt: endedAt }).where(inArray(trainingSets.entryId, entries.map((entry) => entry.id)));
    }
    await tx.update(workouts).set({ startedAt, endedAt }).where(eq(workouts.id, workoutId));
  });
  bumpFinishedVersion();
}

async function completedWorkoutEnd(workoutId: string): Promise<Date> {
  const [workout] = await db.select({ endedAt: workouts.endedAt }).from(workouts).where(eq(workouts.id, workoutId)).limit(1);
  if (!workout?.endedAt) throw new Error('Workout is not finished');
  return workout.endedAt;
}

/** Adds a set to an exercise of a finished workout, already marked as done. */
export async function addSetToCompletedWorkout(workoutId: string, entryId: string): Promise<string> {
  await initializeDatabase();
  await completedWorkoutEnd(workoutId);
  const [entry] = await db.select().from(exerciseEntries).where(eq(exerciseEntries.id, entryId));
  if (entry?.workoutId !== workoutId) throw new Error('Exercise does not belong to workout');
  const setId = await addSet(entryId);
  return setId;
}

/** Adds an exercise with one completed set to a finished workout. */
export async function addExerciseToCompletedWorkout(workoutId: string, exerciseId: string): Promise<string> {
  await initializeDatabase();
  const endedAt = await completedWorkoutEnd(workoutId);
  const entryId = await addExerciseToWorkout(workoutId, exerciseId);
  await db.update(trainingSets).set({ completedAt: endedAt }).where(eq(trainingSets.entryId, entryId));
  bumpFinishedVersion();
  return entryId;
}

/** Marks a set of a finished workout as done (at the workout's end) or not done. */
export async function setCompletedWorkoutSetDone(workoutId: string, setId: string, done: boolean): Promise<void> {
  await initializeDatabase();
  const endedAt = await completedWorkoutEnd(workoutId);
  await assertSetWorkout(setId, workoutId);
  await db.update(trainingSets).set({ completedAt: done ? endedAt : null }).where(await pairCondition(setId));
  bumpFinishedVersion();
}

/** Names of finished workouts, newest first; programs use them to know which session comes next. */
export async function listRecentWorkoutNames(limit = 200): Promise<string[]> {
  await initializeDatabase();
  const rows = await db.select({ name: workouts.name }).from(workouts)
    .where(isNotNull(workouts.endedAt)).orderBy(desc(workouts.startedAt)).limit(limit);
  return rows.map((row) => row.name);
}

export async function listRecentWorkouts(limit = 365): Promise<WorkoutHistoryItem[]> {
  await initializeDatabase();
  const rows = await db
    .select(historyColumns)
    .from(workouts)
    .where(isNotNull(workouts.endedAt))
    .orderBy(desc(workouts.startedAt))
    .limit(limit);
  return withSetCounts(rows);
}

/**
 * One page of finished workouts, newest first. `after` is the last workout of the previous page:
 * the page continues strictly after it (start time, then id, so equal start times are not skipped).
 */
export async function listWorkoutsPage(limit: number, after?: { startedAt: Date; id: string }): Promise<WorkoutHistoryItem[]> {
  await initializeDatabase();
  const rows = await db
    .select(historyColumns)
    .from(workouts)
    .where(and(
      isNotNull(workouts.endedAt),
      after ? or(lt(workouts.startedAt, after.startedAt), and(eq(workouts.startedAt, after.startedAt), lt(workouts.id, after.id))) : undefined,
    ))
    .orderBy(desc(workouts.startedAt), desc(workouts.id))
    .limit(limit);
  return withSetCounts(rows);
}

/** Finished workouts started in [from, to), newest first: one day of the Log, for instance. */
export async function listWorkoutsBetween(from: Date, to: Date): Promise<WorkoutHistoryItem[]> {
  await initializeDatabase();
  const rows = await db
    .select(historyColumns)
    .from(workouts)
    .where(and(isNotNull(workouts.endedAt), gte(workouts.startedAt, from), lt(workouts.startedAt, to)))
    .orderBy(desc(workouts.startedAt), desc(workouts.id));
  return withSetCounts(rows);
}

/** Start times of the finished workouts in [from, to), for the calendar's dots. */
export async function listWorkoutStarts(from: Date, to: Date): Promise<Date[]> {
  await initializeDatabase();
  const rows = await db
    .select({ startedAt: workouts.startedAt })
    .from(workouts)
    .where(and(isNotNull(workouts.endedAt), gte(workouts.startedAt, from), lt(workouts.startedAt, to)));
  return rows.map((row) => row.startedAt);
}

const historyColumns = { id: workouts.id, name: workouts.name, startedAt: workouts.startedAt, endedAt: workouts.endedAt };

/** Adds the completed set count (an L/R pair counts once) to each workout, in one query. */
async function withSetCounts(rows: { id: string; name: string; startedAt: Date; endedAt: Date | null }[]): Promise<WorkoutHistoryItem[]> {
  const setCounts = rows.length === 0 ? [] : await db
    .select({ workoutId: exerciseEntries.workoutId, pairId: trainingSets.pairId, side: trainingSets.side, completedAt: trainingSets.completedAt })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .where(and(inArray(exerciseEntries.workoutId, rows.map((workout) => workout.id)), isNotNull(trainingSets.completedAt)));
  const setsOf = new Map<string, typeof setCounts>();
  for (const set of setCounts) {
    const list = setsOf.get(set.workoutId);
    if (list) list.push(set);
    else setsOf.set(set.workoutId, [set]);
  }
  return rows.map((workout) => ({
    ...workout,
    endedAt: workout.endedAt!,
    setCount: completedSetCount(setsOf.get(workout.id) ?? []),
  }));
}

/**
 * Lets an exercise measured in reps or time carry added load (or assistance): reps becomes
 * reps_load and time becomes time_load. Loaded metrics count everything the plain ones do, so
 * past sets keep their records. Returns true when the metric changed.
 */
export async function enableExerciseLoad(exerciseId: string): Promise<boolean> {
  await initializeDatabase();
  const [exercise] = await db.select({ metric: exercises.metric }).from(exercises).where(eq(exercises.id, exerciseId));
  const next = exercise?.metric === 'reps' ? 'reps_load' : exercise?.metric === 'time' ? 'time_load' : null;
  if (!next) return false;
  await db.update(exercises).set({ metric: next }).where(eq(exercises.id, exerciseId));
  bumpFinishedVersion();
  return true;
}

/** Rates the form of one set, 1–5; null clears it. */
export async function setSetFormRating(setId: string, rating: number | null): Promise<void> {
  await initializeDatabase();
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) throw new RangeError('Form ratings are integers from 1 to 5');
  await db.update(trainingSets).set({ formRating: rating }).where(eq(trainingSets.id, setId));
  await bumpIfFinished({ setId });
}

/** Sets the RPE the program planned for a set; null clears it. */
export async function setSetTargetRpe(setId: string, rpe: number | null): Promise<void> {
  await initializeDatabase();
  if (rpe !== null && !isValidRpe(rpe)) throw new RangeError('Invalid target RPE');
  await db.update(trainingSets).set({ targetRpe: rpe }).where(eq(trainingSets.id, setId));
}

/** Saves an optional free-text note on a set; blank text clears it. */
export async function updateSetNote(setId: string, note: string): Promise<void> {
  await initializeDatabase();
  const trimmed = note.trim().slice(0, 500);
  await db.update(trainingSets).set({ note: trimmed || null }).where(eq(trainingSets.id, setId));
}

/** Saves an optional free-text note on an exercise within a workout; blank text clears it. */
export async function updateEntryNote(entryId: string, note: string): Promise<void> {
  await initializeDatabase();
  const trimmed = note.trim().slice(0, 1000);
  await db.update(exerciseEntries).set({ notes: trimmed || null }).where(eq(exerciseEntries.id, entryId));
}

/** Switches a set between warm-up and working; its own rest is cleared so the kind's rest applies. */
export async function setSetKind(setId: string, kind: SetKind): Promise<void> {
  await initializeDatabase();
  await db.update(trainingSets).set({ kind, restSec: null }).where(await pairCondition(setId));
  await bumpIfFinished({ setId });
}

/**
 * Adds a warm-up set (a left/right pair for unilateral exercises) after the warm-ups the exercise already
 * has and before its first working set, which is where warm-ups are done. It starts from the values of the
 * set it follows, like any new set, and its own rest is left to the warm-up default.
 */
export async function addWarmupSet(entryId: string): Promise<string> {
  const created = await addSet(entryId);
  const rows = await db.select().from(trainingSets).where(eq(trainingSets.entryId, entryId)).orderBy(asc(trainingSets.index));
  const added = rows.find((row) => row.id === created);
  const groups = groupSets(rows);
  const newGroup = groups.find((group) => group.some((row) => row.id === created));
  if (!added || !newGroup) return created;
  const others = groups.filter((group) => group !== newGroup);
  const leading = others.findIndex((group) => group[0].kind !== 'warmup');
  const position = leading < 0 ? others.length : leading;
  const ordered = [...others.slice(0, position), newGroup, ...others.slice(position)];
  await db.transaction(async (tx) => {
    for (const [position2, group] of ordered.entries()) {
      for (const row of group) {
        await tx.update(trainingSets).set({ index: position2 + 1, ...(group === newGroup ? { kind: 'warmup', restSec: null } : {}) }).where(eq(trainingSets.id, row.id));
      }
    }
  });
  await bumpIfFinished({ entryId });
  return created;
}

/** Sets the rest after every not-yet-completed set of one kind in an exercise. */
export async function setEntryRest(entryId: string, kind: SetKind, seconds: number): Promise<void> {
  await initializeDatabase();
  await db.update(trainingSets).set({ restSec: seconds })
    .where(and(eq(trainingSets.entryId, entryId), eq(trainingSets.kind, kind), isNull(trainingSets.completedAt)));
}

/** Saves (or clears, with null) the RPE of a set. */
export async function updateSetRpe(setId: string, rpe: number | null): Promise<void> {
  if (rpe !== null && !isValidRpe(rpe)) throw new RangeError('RPE must be between 6 and 10 in half steps');
  await initializeDatabase();
  await db.update(trainingSets).set({ rpe }).where(eq(trainingSets.id, setId));
  await bumpIfFinished({ setId });
}

/** Removes a set with its clips, then renumbers the remaining sets of that exercise from 1. */
export async function removeSet(setId: string): Promise<void> {
  await initializeDatabase();
  const [set] = await db.select({ entryId: trainingSets.entryId }).from(trainingSets).where(eq(trainingSets.id, setId)).limit(1);
  if (!set) return;
  const finished = await isFinished({ setId });
  const condition = await pairCondition(setId);
  const removed = await db.select({ id: trainingSets.id }).from(trainingSets).where(condition);
  await deleteFormCheckVideosForSets(removed.map((s) => s.id));
  await db.transaction(async (tx) => {
  await tx.delete(trainingSets).where(condition);
  const remaining = await tx.select().from(trainingSets)
    .where(eq(trainingSets.entryId, set.entryId)).orderBy(asc(trainingSets.index));
  for (const [position, group] of groupSets(remaining).entries()) {
    for (const row of group) await tx.update(trainingSets).set({ index: position + 1 }).where(eq(trainingSets.id, row.id));
  }
  });
  if (finished) bumpFinishedVersion();
}

/** Removes an exercise from a workout together with its sets and their clips. */
export async function removeExerciseEntry(entryId: string): Promise<void> {
  await initializeDatabase();
  const finished = await isFinished({ entryId });
  const sets = await db.select({ id: trainingSets.id }).from(trainingSets).where(eq(trainingSets.entryId, entryId));
  await deleteFormCheckVideosForSets(sets.map((set) => set.id));
  await db.delete(exerciseEntries).where(eq(exerciseEntries.id, entryId));
  if (finished) bumpFinishedVersion();
}

/** What a removal took away, kept briefly so it can be put back ("Restore" in the undo toast). */
export interface RemovedRows {
  videos?: (typeof formCheckVideos.$inferSelect)[];
  entry: typeof exerciseEntries.$inferSelect | null;
  sets: (typeof trainingSets.$inferSelect)[];
}

/**
 * Removes a whole set group, retaining its clips on disk and their metadata for undo. Once the undo is
 * no longer offered, `discardRemoved` deletes the kept files.
 */
export async function removeSetWithUndo(setId: string): Promise<RemovedRows | null> {
  await initializeDatabase();
  const [row] = await db.select().from(trainingSets).where(eq(trainingSets.id, setId)).limit(1);
  if (!row) return null;
  const finished = await isFinished({ setId });
  const sets = await db.select().from(trainingSets).where(await pairCondition(setId));
  const videos = await db.select().from(formCheckVideos).where(inArray(formCheckVideos.setId, sets.map((s) => s.id)));
  retainClipFiles(videos.map((video) => video.fileName));
  await db.transaction(async (tx) => {
    await tx.delete(formCheckVideos).where(inArray(formCheckVideos.setId, sets.map((s) => s.id)));
    await tx.delete(trainingSets).where(inArray(trainingSets.id, sets.map((s) => s.id)));
    const remaining = await tx.select().from(trainingSets).where(eq(trainingSets.entryId, row.entryId)).orderBy(asc(trainingSets.index));
    for (const [position, group] of groupSets(remaining).entries()) for (const s of group) await tx.update(trainingSets).set({ index: position + 1 }).where(eq(trainingSets.id, s.id));
  });
  if (finished) bumpFinishedVersion();
  return { entry: null, sets, videos };
}

/**
 * Removes an exercise with its sets and returns a snapshot that `restoreRemoved` can put back. Like
 * `removeSetWithUndo`, its clips stay on disk until `discardRemoved`.
 */
export async function removeExerciseEntryWithUndo(entryId: string): Promise<RemovedRows | null> {
  await initializeDatabase();
  const [entry] = await db.select().from(exerciseEntries).where(eq(exerciseEntries.id, entryId)).limit(1);
  if (!entry) return null;
  const finished = await isFinished({ entryId });
  const sets = await db.select().from(trainingSets).where(eq(trainingSets.entryId, entryId)).orderBy(asc(trainingSets.index));
  const videos = sets.length === 0 ? [] : await db.select().from(formCheckVideos).where(inArray(formCheckVideos.setId, sets.map((s) => s.id)));
  retainClipFiles(videos.map((video) => video.fileName));
  await db.transaction(async (tx) => {
    if (videos.length > 0) await tx.delete(formCheckVideos).where(inArray(formCheckVideos.id, videos.map((video) => video.id)));
    await tx.delete(trainingSets).where(eq(trainingSets.entryId, entryId));
    await tx.delete(exerciseEntries).where(eq(exerciseEntries.id, entryId));
  });
  if (finished) bumpFinishedVersion();
  return { entry, sets, videos };
}

/**
 * Ends the undo of a removal: deletes the clip files it kept on disk. Files a restore put back in use
 * are kept, so calling it after "Restore" (e.g. whenever the undo toast hides) is safe.
 */
export async function discardRemoved(removed: RemovedRows | null): Promise<void> {
  const fileNames = removed?.videos?.map((video) => video.fileName) ?? [];
  if (fileNames.length === 0) return;
  releaseClipFiles(fileNames);
  await deleteClipFilesIfUnused(fileNames);
}

/**
 * Puts removed rows back. A single restored set takes its old number again and the sets after it
 * move down one, so the order is what it was before the removal.
 */
export async function restoreRemoved(removed: RemovedRows): Promise<void> {
  await initializeDatabase();
  const entryId = removed.entry?.id ?? removed.sets[0]?.entryId;
  await db.transaction(async (tx) => {
    if (removed.entry) {
      await tx.insert(exerciseEntries).values(removed.entry);
      if (removed.sets.length > 0) await tx.insert(trainingSets).values(removed.sets);
      if (removed.videos?.length) await tx.insert(formCheckVideos).values(removed.videos);
      return;
    }
    for (const group of groupSets(removed.sets)) {
      const set = group[0];
      const later = await tx.select({ id: trainingSets.id, index: trainingSets.index }).from(trainingSets)
        .where(eq(trainingSets.entryId, set.entryId)).orderBy(desc(trainingSets.index));
      for (const row of later) {
        if (row.index >= set.index) await tx.update(trainingSets).set({ index: row.index + 1 }).where(eq(trainingSets.id, row.id));
      }
      await tx.insert(trainingSets).values(group);
    }
    if (removed.videos?.length) await tx.insert(formCheckVideos).values(removed.videos);
  });
  releaseClipFiles(removed.videos?.map((video) => video.fileName) ?? []);
  if (entryId) await bumpIfFinished({ entryId });
}

export interface PreviousPerformance {
  workoutStartedAt: Date;
  sets: PreviousSetValues[];
}

export type PreviousSetValues = Pick<SessionSet, 'reps' | 'durationSec' | 'distanceM' | 'addedLoadKg' | 'rpe' | 'note' | 'side' | 'pairId'> & { restSec?: number | null; formRating?: number | null };

/** Fills an open set with the values of a set from last time, note included. */
export async function copyValuesToSet(setId: string, values: PreviousSetValues): Promise<void> {
  await initializeDatabase();
  const { reps, durationSec, distanceM, addedLoadKg, rpe, note } = values;
  await db.update(trainingSets).set({ reps, durationSec, distanceM, addedLoadKg, rpe, note }).where(eq(trainingSets.id, setId));
  await bumpIfFinished({ setId });
}

/** Repeats a finished workout unless another one is in progress, whose name is returned instead. */
export async function repeatWorkoutIfIdle(sourceId: string): Promise<{ workoutId: string } | { active: { id: string; name: string } }> {
  const active = await getActiveWorkout();
  if (active) return { active: { id: active.id, name: active.name } };
  return { workoutId: await repeatWorkout(sourceId) };
}

/**
 * Starts a new workout with the same name, exercises and completed sets (kind, values, rest, notes) as
 * a finished one. Exercises without completed sets are left out. Returns the new workout id.
 */
export async function repeatWorkout(sourceId: string): Promise<string> {
  await initializeDatabase();
  const [source] = await db.select({ name: workouts.name }).from(workouts).where(eq(workouts.id, sourceId)).limit(1);
  if (!source) throw new Error('Workout not found');
  const entries = await db.select().from(exerciseEntries).where(eq(exerciseEntries.workoutId, sourceId)).orderBy(asc(exerciseEntries.order));
  const sourceSets = entries.length === 0 ? [] : await db.select().from(trainingSets)
    .where(and(inArray(trainingSets.entryId, entries.map((entry) => entry.id)), isNotNull(trainingSets.completedAt))).orderBy(asc(trainingSets.index));
  const workoutId = id();
  const newEntries: (typeof exerciseEntries.$inferInsert)[] = [];
  const newSets: (typeof trainingSets.$inferInsert)[] = [];
  for (const entry of entries) {
    const sets = sourceSets.filter((set) => set.entryId === entry.id);
    if (sets.length === 0) continue;
    validatePairs(sets, true);
    const entryId = id();
    newEntries.push({ id: entryId, workoutId, exerciseId: entry.exerciseId, order: newEntries.length + 1, notes: entry.notes, groupId: entry.groupId, groupType: entry.groupType, unilateralRestMode: entry.unilateralRestMode, block: entry.block });
    const pairIds = new Map(sets.filter((s) => s.pairId).map((s) => [s.pairId, id()]));
    newSets.push(...sets.map((set) => ({
      // How hard and how clean it was belong to that day: the copy starts without them.
      ...set, id: id(), pairId: set.pairId ? pairIds.get(set.pairId)! : null, entryId, completedAt: null, rpe: null, formRating: null,
    })));
  }
  const bodyweightKg = await latestBodyweightKg();
  // One transaction: a failure part-way leaves no half-copied workout open.
  await db.transaction(async (tx) => {
    await tx.insert(workouts).values({ id: workoutId, name: source.name, startedAt: new Date(), bodyweightKg });
    if (newEntries.length > 0) await tx.insert(exerciseEntries).values(newEntries);
    for (let start = 0; start < newSets.length; start += INSERT_CHUNK) await tx.insert(trainingSets).values(newSets.slice(start, start + INSERT_CHUNK));
  });
  return workoutId;
}

/** Rows per multi-row insert, well under SQLite's limit on bound parameters. */
const INSERT_CHUNK = 100;

/** One set (one row, or the two rows of an L/R pair) planned before the workout starts. */
export type PlannedSet = {
  side: 'both' | 'left' | 'right';
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
  addedLoadKg: number;
  restSec: number | null;
  targetRpe: number | null;
}[];

export interface PlannedEntry {
  exerciseId: string;
  notes?: string | null;
  sets: PlannedSet[];
}

/**
 * Adds exercises with their planned sets to a workout in progress, in one transaction, in the same
 * shape `addExerciseToWorkout` and `addSet` build one by one: a mobility exercise after other work
 * goes to the mobility block, and an L/R pair shares its index and a pair id. Returns the entry ids.
 */
export async function addPlannedEntries(workoutId: string, planned: readonly PlannedEntry[]): Promise<string[]> {
  await initializeDatabase();
  if (planned.length === 0) return [];
  for (const entry of planned) {
    for (const set of entry.sets) {
      if (set.length === 0 || set.length > 2 || (set.length === 2) !== set.every((row) => row.side !== 'both')) throw new Error('Invalid planned set');
      for (const row of set) {
        for (const field of SET_VALUE_FIELDS) {
          const v = row[field];
          if (v !== null && !isValidSetValue(field, v)) throw new Error('Invalid workout set value');
        }
        if (row.restSec !== null && (!Number.isInteger(row.restSec) || row.restSec < 0 || row.restSec > 3600)) throw new RangeError('Rest time must be an integer between 0 and 3600 seconds.');
        if (row.targetRpe !== null && !isValidRpe(row.targetRpe)) throw new RangeError('Invalid target RPE');
      }
    }
  }
  const existing = await db.select({ id: exerciseEntries.id, order: exerciseEntries.order, block: exerciseEntries.block, category: exercises.category, extra: exercises.extraCategories })
    .from(exerciseEntries).innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id)).where(eq(exerciseEntries.workoutId, workoutId));
  const added = await db.select({ id: exercises.id, category: exercises.category, extra: exercises.extraCategories }).from(exercises)
    .where(inArray(exercises.id, [...new Set(planned.map((entry) => entry.exerciseId))]));
  const kindOf = new Map(added.map((row) => [row.id, row]));
  const isMobility = (row?: { category: string; extra: string }) => !!row && (row.category === 'mobility' || row.extra.includes('"mobility"'));
  let anyOther = existing.some((row) => !isMobility(row));
  let order = existing.reduce((last, row) => Math.max(last, row.order), 0);
  const newEntries: (typeof exerciseEntries.$inferInsert & { order: number; block: string | null })[] = [];
  const newSets: (typeof trainingSets.$inferInsert)[] = [];
  for (const entry of planned) {
    const exercise = kindOf.get(entry.exerciseId);
    if (!exercise) throw new Error('Exercise not found');
    const mobility = isMobility(exercise);
    const entryId = id();
    order += 1;
    newEntries.push({ id: entryId, workoutId, exerciseId: entry.exerciseId, order, block: mobility && anyOther ? 'mobility' : null, notes: entry.notes?.trim().slice(0, 1000) || null });
    if (!mobility) anyOther = true;
    for (const [position, set] of entry.sets.entries()) {
      const pairId = set.length === 2 ? id() : null;
      for (const row of set) newSets.push({ ...row, id: id(), entryId, index: position + 1, kind: 'working', pairId, band: null, rpe: null, note: null, completedAt: null });
    }
  }
  // Every block stays contiguous, as normalizeBlockOrder keeps it.
  const ordered = sortByBlock([...existing, ...newEntries]);
  await db.transaction(async (tx) => {
    for (const [position, row] of ordered.entries()) {
      const fresh = newEntries.find((entry) => entry.id === row.id);
      if (fresh) fresh.order = position + 1;
      else if (row.order !== position + 1) await tx.update(exerciseEntries).set({ order: position + 1 }).where(eq(exerciseEntries.id, row.id));
    }
    await tx.insert(exerciseEntries).values(newEntries);
    for (let start = 0; start < newSets.length; start += INSERT_CHUNK) await tx.insert(trainingSets).values(newSets.slice(start, start + INSERT_CHUNK));
  });
  await bumpIfFinished({ workoutId });
  return newEntries.map((entry) => entry.id!);
}

/** Completed sets from the most recent finished workout that included each exercise. */
export async function getPreviousPerformance(exerciseIds: string[], excludeWorkoutId: string): Promise<Map<string, PreviousPerformance>> {
  await initializeDatabase();
  const result = new Map<string, PreviousPerformance>();
  if (exerciseIds.length === 0) return result;
  const done = and(isNotNull(workouts.endedAt), isNotNull(trainingSets.completedAt), eq(trainingSets.kind, 'working'));
  // First the latest finished workout of each exercise (SQLite takes the bare workout id from the
  // row holding the max), then only the sets of those workouts.
  const latest = await db
    .select({ exerciseId: exerciseEntries.exerciseId, workoutId: workouts.id, startedAt: max(workouts.startedAt) })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(inArray(exerciseEntries.exerciseId, exerciseIds), done, ne(workouts.id, excludeWorkoutId)))
    .groupBy(exerciseEntries.exerciseId);
  if (latest.length === 0) return result;
  const latestWorkout = new Map(latest.map((row) => [row.exerciseId, row.workoutId]));
  const rows = await db
    .select({
      exerciseId: exerciseEntries.exerciseId,
      workoutId: workouts.id,
      startedAt: workouts.startedAt,
      side: trainingSets.side,
      pairId: trainingSets.pairId,
      reps: trainingSets.reps,
      durationSec: trainingSets.durationSec,
      distanceM: trainingSets.distanceM,
      addedLoadKg: trainingSets.addedLoadKg,
      rpe: trainingSets.rpe,
      note: trainingSets.note,
      restSec: trainingSets.restSec,
      formRating: trainingSets.formRating,
    })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(inArray(exerciseEntries.exerciseId, [...latestWorkout.keys()]), inArray(workouts.id, [...new Set(latestWorkout.values())]), done))
    .orderBy(desc(workouts.startedAt), asc(trainingSets.index));
  for (const row of rows) {
    if (latestWorkout.get(row.exerciseId) !== row.workoutId) continue;
    const entry: PreviousPerformance = result.get(row.exerciseId) ?? { workoutStartedAt: row.startedAt, sets: [] };
    entry.sets.push({ side: row.side, pairId: row.pairId, reps: row.reps, durationSec: row.durationSec, distanceM: row.distanceM, addedLoadKg: row.addedLoadKg, rpe: row.rpe, note: row.note, restSec: row.restSec, formRating: row.formRating });
    result.set(row.exerciseId, entry);
  }
  return result;
}

/** Marks a completed set as not done again, e.g. after tapping complete by mistake. */
export async function uncompleteSet(setId: string): Promise<void> {
  await initializeDatabase();
  await requireActiveSet(setId);
  await db.update(trainingSets).set({ completedAt: null }).where(eq(trainingSets.id, setId));
}

export interface LoggedSetInput {
  pairId?: string | null;
  reps?: number | null;
  durationSec?: number | null;
  side?: 'left' | 'right' | 'both';
  completedAt: Date;
}

/**
 * Records an already-finished session (e.g. a guided mobility routine) in one transaction, with
 * its real start and end times, so it counts toward history, streaks and progress like any workout.
 */
export async function logCompletedWorkout(input: {
  name: string;
  startedAt: Date;
  endedAt: Date;
  entries: { exerciseId: string; sets: LoggedSetInput[] }[];
}): Promise<string> {
  await initializeDatabase();
  if (!Number.isFinite(input.startedAt.getTime()) || !Number.isFinite(input.endedAt.getTime()) || input.endedAt < input.startedAt) throw new Error('Invalid workout times');
  const workoutId = id();
  const entries = input.entries.filter((entry) => entry.sets.length > 0);
  for (const entry of entries) {
    const [exercise] = await db.select().from(exercises).where(eq(exercises.id, entry.exerciseId));
    if (!exercise) throw new Error('Exercise not found');
    entry.sets = entry.sets.flatMap((set) => {
      if (!Number.isFinite(set.completedAt.getTime()) || (set.reps != null && (!Number.isInteger(set.reps) || set.reps < 0)) || (set.durationSec != null && (!Number.isInteger(set.durationSec) || set.durationSec < 0))) throw new Error('Invalid logged set');
      if (set.side && set.side !== 'both' && !set.pairId) throw new Error('Unilateral sets require an explicit pair');
      if (exercise.unilateral && !set.pairId && (!set.side || set.side === 'both')) {
        const pairId = id();
        return [{ ...set, pairId, side: 'left' as const }, { ...set, pairId, side: 'right' as const }];
      }
      return [set];
    });
    validatePairs(entry.sets, true);
  }
  await db.transaction(async (tx) => {
    await tx.insert(workouts).values({ id: workoutId, name: input.name, startedAt: input.startedAt, endedAt: input.endedAt });
    for (const [order, entry] of entries.entries()) {
      const entryId = id();
      const pairIds = new Map(entry.sets.filter((s) => s.pairId).map((s) => [s.pairId!, id()]));
      await tx.insert(exerciseEntries).values({ id: entryId, workoutId, exerciseId: entry.exerciseId, order: order + 1 });
      const indexes = new Map(groupSets(entry.sets).flatMap((group, position) => group.map((set) => [set, position + 1] as const)));
      for (const set of entry.sets) {
        await tx.insert(trainingSets).values({
          id: id(),
          entryId,
          index: indexes.get(set)!,
          reps: set.reps ?? null,
          durationSec: set.durationSec ?? null,
          side: set.side ?? 'both',
          pairId: set.pairId ? pairIds.get(set.pairId)! : null,
          completedAt: set.completedAt,
        });
      }
    }
  });
  bumpFinishedVersion();
  return workoutId;
}

/**
 * Swaps the exercise of an entry, keeping its sets, notes and superset. Sets keep their values when the
 * new exercise is measured the same way (reps, hold or distance); otherwise they restart at that
 * measure's default. The load is kept only when the new exercise carries one.
 */
export async function replaceEntryExercise(entryId: string, exerciseId: string): Promise<void> {
  await initializeDatabase();
  const [current] = await db.select({ metric: exercises.metric }).from(exerciseEntries)
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id)).where(eq(exerciseEntries.id, entryId)).limit(1);
  const [next] = await db.select({ metric: exercises.metric }).from(exercises).where(eq(exercises.id, exerciseId)).limit(1);
  if (!current || !next) throw new Error('Exercise not found');
  await db.update(exerciseEntries).set({ exerciseId }).where(eq(exerciseEntries.id, entryId));
  if (measureOf(current.metric) !== measureOf(next.metric)) {
    const measure = measureOf(next.metric);
    await db.update(trainingSets).set({
      reps: measure === 'reps' ? 8 : null,
      durationSec: measure === 'time' ? 10 : null,
      distanceM: measure === 'distance' ? 10 : null,
    }).where(eq(trainingSets.entryId, entryId));
  }
  if (!isLoadMetric(next.metric)) await db.update(trainingSets).set({ addedLoadKg: 0 }).where(eq(trainingSets.entryId, entryId));
  await bumpIfFinished({ entryId });
}

/** Puts an exercise in a superset with the one after it, joining whichever superset either is in. */
export async function linkWithNext(entryId: string): Promise<void> {
  await initializeDatabase();
  const [current] = await db.select().from(exerciseEntries).where(eq(exerciseEntries.id, entryId)).limit(1);
  if (!current) return;
  const [next] = await db.select().from(exerciseEntries)
    .where(and(eq(exerciseEntries.workoutId, current.workoutId), gt(exerciseEntries.order, current.order)))
    .orderBy(asc(exerciseEntries.order)).limit(1);
  if (!next) return;
  const groupId = current.groupId ?? next.groupId ?? id();
  const groupType = current.groupType ?? next.groupType ?? formatSupersetType({ mode: 'round', betweenSec: 0 });
  const oldGroups = [current.groupId, next.groupId].filter((value): value is string => value !== null);
  await db.update(exerciseEntries).set({ groupId, groupType }).where(or(
    inArray(exerciseEntries.id, [current.id, next.id]),
    oldGroups.length ? and(eq(exerciseEntries.workoutId, current.workoutId), inArray(exerciseEntries.groupId, oldGroups)) : undefined,
  ));
}

/** Takes an exercise out of its superset; a superset left with one exercise is dissolved. */
export async function unlinkEntry(entryId: string): Promise<void> {
  await initializeDatabase();
  const [current] = await db.select().from(exerciseEntries).where(eq(exerciseEntries.id, entryId)).limit(1);
  if (!current?.groupId) return;
  await db.update(exerciseEntries).set({ groupId: null, groupType: null }).where(eq(exerciseEntries.id, entryId));
  const rest = await db.select({ id: exerciseEntries.id }).from(exerciseEntries)
    .where(and(eq(exerciseEntries.workoutId, current.workoutId), eq(exerciseEntries.groupId, current.groupId)));
  if (rest.length === 1) await db.update(exerciseEntries).set({ groupId: null, groupType: null }).where(eq(exerciseEntries.id, rest[0].id));
}

export async function setSupersetRest(groupId: string, rest: SupersetRest): Promise<void> {
  await initializeDatabase();
  await db.update(exerciseEntries).set({ groupType: formatSupersetType(rest) }).where(eq(exerciseEntries.groupId, groupId));
}

/**
 * Moves an exercise of a workout (in progress or finished) to another position. Positions are
 * rewritten as 1..n. A superset member that ends up away from its group leaves it, and a group left
 * with a single exercise dissolves, so a superset is always made of neighbours.
 */
export async function moveExerciseEntry(workoutId: string, entryId: string, toIndex: number): Promise<void> {
  await initializeDatabase();
  const entries = await db.select().from(exerciseEntries).where(eq(exerciseEntries.workoutId, workoutId)).orderBy(asc(exerciseEntries.order));
  const from = entries.findIndex((entry) => entry.id === entryId);
  if (from < 0) return;
  const target = Math.min(entries.length - 1, Math.max(0, toIndex));
  if (target === from) return;
  const reordered = [...entries];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(target, 0, moved);
  // Dropped between two blocks, the exercise joins the block above it (the one below when it became first).
  const movedBlock = blockAfterMove(reordered, target);
  await db.transaction(async (tx) => {
    for (const [position, entry] of reordered.entries()) {
      if (entry.order !== position + 1) await tx.update(exerciseEntries).set({ order: position + 1 }).where(eq(exerciseEntries.id, entry.id));
    }
    if (blockOf(moved.block) !== movedBlock) await tx.update(exerciseEntries).set({ block: movedBlock === 'main' ? null : movedBlock }).where(eq(exerciseEntries.id, moved.id));
    if (!moved.groupId) return;
    const members = reordered.filter((entry) => entry.groupId === moved.groupId);
    const positions = members.map((entry) => reordered.indexOf(entry));
    const contiguous = positions[positions.length - 1] - positions[0] === members.length - 1;
    if (contiguous) return;
    await tx.update(exerciseEntries).set({ groupId: null, groupType: null }).where(eq(exerciseEntries.id, moved.id));
    const rest = members.filter((entry) => entry.id !== moved.id);
    if (rest.length === 1) await tx.update(exerciseEntries).set({ groupId: null, groupType: null }).where(eq(exerciseEntries.id, rest[0].id));
  });
  await bumpIfFinished({ workoutId });
}
