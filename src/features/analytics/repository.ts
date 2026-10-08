import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db, initializeDatabase } from '../../db/client';
import { cachedUntilHistoryChange } from '../../db/cache';
import { exerciseEntries, exercises, trainingSets, workouts } from '../../db/schema';
import { buildExerciseCycle, buildExerciseWeek, buildMobilityCycles, buildMobilityWeek, mobilitySecondsForWorkout, type ExerciseCycle, type ExerciseWeek, type MobilityWeek } from './mobility';
import { buildExerciseEstimate, buildOneRepMaxEstimate, type ExerciseEstimate, type OneRepMaxEstimate } from './estimates';
import type { ExploreData } from './explore';
import { buildProgressSnapshot, detectWorkoutRecords, type CompletedSetRow, type CompletedWorkoutRow, type ProgressSnapshot, type WorkoutRecord } from './summary';
import type { StatsSetRow } from './trainingStats';
import { detectSetRecords, detectVolumeRecords, exerciseRecordSummary, type BandHelpComparer, type ExerciseRecordSummary, type RecordRow, type SetRecord, type VolumeRecord } from './records';
import { getEffectiveLoad } from './summary';
import { aggregatePairs, groupSets, type PairScope } from '../../domain/setPairs';
import { bandRanks, compareBandHelp, parseSetBands } from '../../domain/equipment';
import { getEquipment } from '../equipment/repository';
import { repsAtLoadFromRows, type RepsAtLoadGroup } from './repsAtLoad';

/** Scope raw rows once here; the domain builders still accept legacy unscoped rows. */
function rowsForScope<T extends { pairId?: string | null; exerciseId: string }>(rows: readonly T[], scope: PairScope, exerciseId: string): T[] {
  const own = rows.filter((row) => row.exerciseId === exerciseId);
  return aggregatePairs(scope === 'average' && own.some((row) => row.pairId) ? own.filter((row) => row.pairId) : own, scope);
}

/** Load only finalized workouts and sets, then summarize them in the domain layer. */
export async function getProgressSnapshot(now = new Date()): Promise<ProgressSnapshot> {
  const rows = await loadCompletedSetRows();
  const completedWorkouts: CompletedWorkoutRow[] = await db
    .select({ id: workouts.id, startedAt: workouts.startedAt })
    .from(workouts)
    .where(isNotNull(workouts.endedAt))
    .orderBy(desc(workouts.startedAt));

  return buildProgressSnapshot(rows, now, completedWorkouts);
}

/** New personal records set in a finished workout, compared with every earlier workout. */
export async function getWorkoutRecords(workoutId: string): Promise<WorkoutRecord[]> {
  return detectWorkoutRecords(await loadCompletedSetRows(), workoutId);
}

/** Mobility hold time and sessions over the last 7 days. */
export async function getMobilityWeek(now = new Date()): Promise<MobilityWeek> {
  return buildMobilityWeek(await loadCompletedSetRows(), now);
}

/** Seconds of mobility holds in one finished workout. */
export async function getWorkoutMobilitySeconds(workoutId: string): Promise<number> {
  return mobilitySecondsForWorkout(await loadCompletedSetRows(), workoutId);
}

/** Last-7-days sets, sessions and (for holds) time of one exercise. */
export async function getExerciseWeekStats(exerciseId: string, metric: string, now = new Date(), scope: PairScope = 'average'): Promise<ExerciseWeek> {
  return buildExerciseWeek(rowsForScope(await loadCompletedSetRows(), scope, exerciseId), exerciseId, metric, now);
}

/** The exercise's own training week in progress (started the first day it was trained), and the one before. */
export async function getExerciseCycle(exerciseId: string, now = new Date(), scope: PairScope = 'average'): Promise<{ current: ExerciseCycle | null; previous: ExerciseCycle | null }> {
  return buildExerciseCycle(rowsForScope(await loadCompletedSetRows(), scope, exerciseId), exerciseId, now);
}

/** Mobility exercises whose own training week is in progress. */
export async function getMobilityCycles(now = new Date()): Promise<ExerciseCycle[]> {
  return buildMobilityCycles(await loadCompletedSetRows(), now);
}

/** Completed working sets of finished workouts, flat, for the statistics screen. */
export async function getTrainingStatsRows(): Promise<StatsSetRow[]> {
  await initializeDatabase();
  return db.select({
    pairId: trainingSets.pairId,
    side: trainingSets.side,
    workoutId: workouts.id,
    workoutName: workouts.name,
    workoutStartedAt: workouts.startedAt,
    exerciseId: exercises.id,
    exerciseName: exercises.name,
    metric: exercises.metric,
    movementGroup: exercises.movementGroup,
    movementTag: exercises.movementTag,
    movementTags: exercises.movementTags,
    category: exercises.category,
    extraCategories: exercises.extraCategories,
    mobilityMode: exercises.mobilityMode,
    reps: trainingSets.reps,
    durationSec: trainingSets.durationSec,
    addedLoadKg: trainingSets.addedLoadKg,
    assistKg: trainingSets.assistKg,
    bands: trainingSets.bands,
    rpe: trainingSets.rpe,
  }).from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(isNotNull(workouts.endedAt), isNotNull(trainingSets.completedAt), eq(trainingSets.kind, 'working')))
    .then((rows) => rows.map(({ bands, ...row }) => ({ ...row, bandCount: parseSetBands(bands).length })));
}

/** RPE-based max reps or max hold of one bodyweight exercise. */
export async function getExerciseEstimate(exerciseId: string, now = new Date(), scope: PairScope = 'average', netLoadKg: number | null = null): Promise<ExerciseEstimate | null> {
  return buildExerciseEstimate(rowsForScope(await loadCompletedSetRows(), scope, exerciseId), exerciseId, now, netLoadKg);
}

/** Estimated 1RM of one exercise, from load or help from bands, bodyweight share and RPE. */
export async function getExerciseOneRepMax(exerciseId: string, now = new Date(), scope: PairScope = 'average'): Promise<OneRepMaxEstimate | null> {
  return buildOneRepMaxEstimate(rowsForScope(await loadCompletedSetRows(), scope, exerciseId), exerciseId, now);
}

/** Every finished set and workout, for the statistics explorer to slice in memory. */
export async function getExploreData(): Promise<ExploreData> {
  const rows = await loadCompletedSetRows();
  const finished = await db
    .select({
      id: workouts.id,
      name: workouts.name,
      startedAt: workouts.startedAt,
      endedAt: workouts.endedAt,
      sessionRpe: workouts.sessionRpe,
      sleep: workouts.sleep,
      energy: workouts.energy,
      soreness: workouts.soreness,
    })
    .from(workouts)
    .where(isNotNull(workouts.endedAt))
    .orderBy(asc(workouts.startedAt));
  return { rows, workouts: finished };
}

const loadCompletedSetRows = cachedUntilHistoryChange(readCompletedSetRows);

async function readCompletedSetRows(): Promise<CompletedSetRow[]> {
  await initializeDatabase();
  return db
    .select({
      workoutId: workouts.id,
      pairId: trainingSets.pairId,
      side: trainingSets.side,
      workoutStartedAt: workouts.startedAt,
      bodyweightKg: workouts.bodyweightKg,
      exerciseId: exercises.id,
      exerciseName: exercises.name,
      category: exercises.category,
      extraCategories: exercises.extraCategories,
      movementPattern: exercises.movementPattern,
      movementGroup: exercises.movementGroup,
      metric: exercises.metric,
      leverageFactor: exercises.leverageFactor,
      setId: trainingSets.id,
      reps: trainingSets.reps,
      durationSec: trainingSets.durationSec,
      distanceM: trainingSets.distanceM,
      addedLoadKg: trainingSets.addedLoadKg,
      assistKg: trainingSets.assistKg,
      bands: trainingSets.bands,
      completedAt: trainingSets.completedAt,
      rpe: trainingSets.rpe,
      formRating: trainingSets.formRating,
    })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(isNotNull(workouts.endedAt), isNotNull(trainingSets.completedAt), eq(trainingSets.kind, 'working')))
    .orderBy(asc(trainingSets.completedAt))
    .then((rows) => rows.map(({ bands, ...row }) => ({ ...row, bandCount: parseSetBands(bands).length })));
}

/**
 * Completed working sets in chronological order, from finished workouts plus `includeWorkoutId`
 * (the one in progress). Rest before a set is the rest set on the previous completed working set of the exercise.
 */
const loadFinishedRecordRows = cachedUntilHistoryChange(() => readRecordRows());

/**
 * Record rows of finished workouts (cached), plus those of the workout in progress when asked. Only
 * the workout in progress is read again; it started after every finished one, so it goes last.
 */
async function loadRecordRows(includeWorkoutId?: string): Promise<RecordRow[]> {
  const finished = await loadFinishedRecordRows();
  if (!includeWorkoutId) return finished;
  const [workout] = await db.select({ endedAt: workouts.endedAt }).from(workouts).where(eq(workouts.id, includeWorkoutId));
  if (!workout || workout.endedAt) return finished;
  return [...finished, ...await readRecordRows(includeWorkoutId)];
}

async function readRecordRows(onlyWorkoutId?: string): Promise<RecordRow[]> {
  await initializeDatabase();
  const workoutFilter = onlyWorkoutId ? eq(workouts.id, onlyWorkoutId) : isNotNull(workouts.endedAt);
  const rows = await db
    .select({
      setId: trainingSets.id,
      pairId: trainingSets.pairId,
      side: trainingSets.side,
      entryId: exerciseEntries.id,
      workoutId: workouts.id,
      bodyweightKg: workouts.bodyweightKg,
      exerciseId: exercises.id,
      metric: exercises.metric,
      leverageFactor: exercises.leverageFactor,
      kind: trainingSets.kind,
      reps: trainingSets.reps,
      durationSec: trainingSets.durationSec,
      addedLoadKg: trainingSets.addedLoadKg,
      restSec: trainingSets.restSec,
      assistKg: trainingSets.assistKg,
      bands: trainingSets.bands,
      apparatusId: exerciseEntries.apparatusId,
      defaultApparatusId: exercises.defaultApparatusId,
      apparatusAffectsDifficulty: exercises.apparatusAffectsDifficulty,
    })
    .from(trainingSets)
    .innerJoin(exerciseEntries, eq(trainingSets.entryId, exerciseEntries.id))
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(workoutFilter, isNotNull(trainingSets.completedAt)))
    .orderBy(asc(workouts.startedAt), asc(exerciseEntries.order), asc(trainingSets.index));
  const result: RecordRow[] = [];
  let previous: (typeof rows)[number] | null = null;
  for (const group of groupSets(rows)) {
    const restBeforePair = previous?.entryId === group[0].entryId && previous.kind === 'working' ? previous.restSec : null;
    for (const row of group) {
    // Rest after a warm-up is not comparable with rest between working sets.
    const restBeforeSec = row.pairId ? restBeforePair : previous?.entryId === row.entryId && previous.kind === 'working' ? previous.restSec : null;
    if (row.kind !== 'working') continue;
    // Band assistance counts as negative load, so an assisted set is compared at its real load.
    const addedLoadKg = row.addedLoadKg - (row.assistKg ?? 0);
    const effectiveLoadKg = getEffectiveLoad({ ...row, addedLoadKg, assistKg: null, bandCount: 0, distanceM: null, completedAt: null } as never) ?? null;
    const apparatus = row.apparatusAffectsDifficulty ? row.apparatusId ?? row.defaultApparatusId : null;
    result.push({
      pairId: row.pairId, side: row.side,
      setId: row.setId, workoutId: row.workoutId, exerciseId: row.exerciseId, metric: row.metric,
      compareKey: apparatus ? `${row.exerciseId}@${apparatus}` : row.exerciseId,
      reps: row.reps, durationSec: row.durationSec, addedLoadKg, effectiveLoadKg, restBeforeSec,
      bands: parseSetBands(row.bands), assistKg: row.assistKg,
    });
    }
    previous = group.at(-1) ?? null;
  }
  return result;
}

/** PRs and volume mini PRs of a workout, in progress or finished. */
export async function getSessionRecords(workoutId: string): Promise<{ sets: SetRecord[]; volume: VolumeRecord[] }> {
  const rows = await loadRecordRows(workoutId);
  const catalog = await getEquipment();
  const ranks = bandRanks(catalog.bandSets, catalog.bandOrder);
  const compareBands: BandHelpComparer = (a, b) => compareBandHelp(a, b, ranks);
  return { sets: detectSetRecords(rows, workoutId, 'average', compareBands), volume: detectVolumeRecords(rows, workoutId) };
}

/** Reps at each logged load across finished sessions of one exercise, in a side view. */
export async function getExerciseRepsAtLoad(exerciseId: string, scope: PairScope = 'average'): Promise<RepsAtLoadGroup[]> {
  const rows = rowsForScope(await loadCompletedSetRows(), scope, exerciseId);
  if (rows.length === 0) return [];
  const names = await db.selectDistinct({ id: workouts.id, name: workouts.name }).from(workouts)
    .innerJoin(exerciseEntries, eq(exerciseEntries.workoutId, workouts.id))
    .where(and(eq(exerciseEntries.exerciseId, exerciseId), isNotNull(workouts.endedAt)));
  return repsAtLoadFromRows(rows, new Map(names.map((row) => [row.id, row.name])));
}

export async function getExerciseRecordSummary(exerciseId: string, scope: PairScope = 'average'): Promise<ExerciseRecordSummary> {
  return exerciseRecordSummary(await loadRecordRows(), exerciseId, scope);
}

export interface ExerciseHistorySet {
  pairId?: string | null;
  side?: string;
  pairMembers?: readonly ExerciseHistorySet[];
  id: string;
  kind: string;
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
  addedLoadKg: number;
  /** Kg of help from bands (null without bands, or when a band's kg are unknown). */
  assistKg?: number | null;
  /** Names are not stored on the set: the number of bands tells there were some. */
  bandCount?: number;
  rpe: number | null;
}

export interface ExerciseHistorySession {
  workoutId: string;
  workoutName: string;
  startedAt: Date;
  notes: string | null;
  sets: ExerciseHistorySet[];
}

export interface ExerciseHistoryOverview {
  /** Finished sessions with at least one completed set of the exercise. */
  sessions: number;
  /** Some sets were logged per side (L/R pairs or a side). */
  sided: boolean;
  /** Some sets were logged without a side. */
  sideless: boolean;
}

/** Counts behind the exercise page's history, without loading every set. */
export async function getExerciseHistoryOverview(exerciseId: string): Promise<ExerciseHistoryOverview> {
  await initializeDatabase();
  const [row] = await db.select({
    sessions: sql<number>`count(distinct ${workouts.id})`,
    sided: sql<number>`coalesce(max(${trainingSets.pairId} is not null or ${trainingSets.side} in ('left', 'right')), 0)`,
    sideless: sql<number>`coalesce(max(${trainingSets.pairId} is null and (${trainingSets.side} is null or ${trainingSets.side} = 'both')), 0)`,
  }).from(exerciseEntries)
    .innerJoin(workouts, eq(workouts.id, exerciseEntries.workoutId))
    .innerJoin(trainingSets, eq(trainingSets.entryId, exerciseEntries.id))
    .where(and(eq(exerciseEntries.exerciseId, exerciseId), isNotNull(workouts.endedAt), isNotNull(trainingSets.completedAt)));
  return { sessions: Number(row?.sessions ?? 0), sided: Number(row?.sided ?? 0) > 0, sideless: Number(row?.sideless ?? 0) > 0 };
}

/** Every finished session that included an exercise, newest first, with its completed sets in order. */
export async function getExerciseHistory(exerciseId: string, limit?: number): Promise<ExerciseHistorySession[]> {
  await initializeDatabase();
  const done = and(eq(exerciseEntries.exerciseId, exerciseId), isNotNull(workouts.endedAt), isNotNull(trainingSets.completedAt));
  // With a limit, pick the latest sessions first so only their sets are read.
  const latest = limit === undefined ? null : (await db.selectDistinct({ id: workouts.id, startedAt: workouts.startedAt }).from(exerciseEntries)
    .innerJoin(workouts, eq(workouts.id, exerciseEntries.workoutId))
    .innerJoin(trainingSets, eq(trainingSets.entryId, exerciseEntries.id))
    .where(done).orderBy(desc(workouts.startedAt)).limit(limit)).map((row) => row.id);
  if (latest?.length === 0) return [];
  const rows = await db.select({
    entryId: exerciseEntries.id,
    notes: exerciseEntries.notes,
    workoutId: workouts.id,
    workoutName: workouts.name,
    startedAt: workouts.startedAt,
    setId: trainingSets.id,
    pairId: trainingSets.pairId,
    side: trainingSets.side,
    index: trainingSets.index,
    kind: trainingSets.kind,
    reps: trainingSets.reps,
    durationSec: trainingSets.durationSec,
    distanceM: trainingSets.distanceM,
    addedLoadKg: trainingSets.addedLoadKg,
    assistKg: trainingSets.assistKg,
    bands: trainingSets.bands,
    rpe: trainingSets.rpe,
  }).from(exerciseEntries)
    .innerJoin(workouts, eq(workouts.id, exerciseEntries.workoutId))
    .innerJoin(trainingSets, eq(trainingSets.entryId, exerciseEntries.id))
    .where(latest ? and(done, inArray(workouts.id, latest)) : done)
    .orderBy(desc(workouts.startedAt), asc(exerciseEntries.order), asc(trainingSets.index));
  const sessions = new Map<string, ExerciseHistorySession>();
  for (const row of rows) {
    let session = sessions.get(row.workoutId);
    if (!session) {
      if (limit !== undefined && sessions.size >= limit) break;
      session = { workoutId: row.workoutId, workoutName: row.workoutName, startedAt: row.startedAt, notes: row.notes, sets: [] };
      sessions.set(row.workoutId, session);
    }
    session.sets.push({ id: row.setId, pairId: row.pairId, side: row.side, kind: row.kind, reps: row.reps, durationSec: row.durationSec, distanceM: row.distanceM, addedLoadKg: row.addedLoadKg, assistKg: row.assistKg, bandCount: parseSetBands(row.bands).length, rpe: row.rpe });
  }
  return [...sessions.values()];
}
