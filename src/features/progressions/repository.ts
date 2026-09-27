import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import { evaluateProgression, type ProgressionSession, type ProgressionTarget } from '../../domain/progression';
import { db, initializeDatabase } from '../../db/client';
import { exerciseEntries, exercises, levelCriteria, progressionChains, trainingSets, workouts } from '../../db/schema';

interface ParsedCriteria {
  target: ProgressionTarget | null;
  requiredSessions: number;
}

function parseCriteria(targetJson: string, requiredSessions: number): ParsedCriteria {
  let parsed: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(targetJson);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { target: null, requiredSessions: validSessionCount(requiredSessions) };
    }
    parsed = value as Record<string, unknown>;
  } catch {
    return { target: null, requiredSessions: validSessionCount(requiredSessions) };
  }

  const target: ProgressionTarget = {
    sets: typeof parsed.sets === 'number' ? parsed.sets : 0,
  };
  const unit = typeof parsed.unit === 'string' ? parsed.unit.toLowerCase() : '';
  if (unit === 'seconds' || unit === 'second' || unit === 'sec' || unit === 'time') {
    const duration = typeof parsed.durationSec === 'number' ? parsed.durationSec : parsed.reps;
    if (typeof duration === 'number') target.durationSec = duration;
  } else if (unit === 'reps' || unit === 'rep' || unit === 'count') {
    const reps = typeof parsed.reps === 'number' ? parsed.reps : parsed.count;
    if (typeof reps === 'number') target.reps = reps;
  } else {
    if (typeof parsed.reps === 'number') target.reps = parsed.reps;
    if (typeof parsed.durationSec === 'number') target.durationSec = parsed.durationSec;
  }
  if (typeof parsed.addedLoadKg === 'number') target.addedLoadKg = parsed.addedLoadKg;

  const hasMetric = target.reps !== undefined || target.durationSec !== undefined || target.addedLoadKg !== undefined;
  const valid = Number.isInteger(target.sets) && target.sets > 0 && hasMetric &&
    Object.entries(target).every(([key, value]) => key === 'sets' || (typeof value === 'number' && Number.isFinite(value) && value >= 0));
  return { target: valid ? target : null, requiredSessions: validSessionCount(requiredSessions) };
}

function validSessionCount(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

export async function getProgressionChain(chainId: string) {
  await initializeDatabase();
  const [chain] = await db
    .select()
    .from(progressionChains)
    .where(eq(progressionChains.id, chainId))
    .limit(1);
  if (!chain) return null;

  const criteriaRows = await db
    .select({ exercise: exercises, criteria: levelCriteria })
    .from(exercises)
    .leftJoin(
      levelCriteria,
      and(eq(exercises.level, levelCriteria.level), eq(exercises.chainId, levelCriteria.chainId)),
    )
    .where(eq(exercises.chainId, chainId))
    .orderBy(asc(exercises.level));
  const levels = criteriaRows.map(({ exercise, criteria }) => {
    const parsed = criteria
      ? parseCriteria(criteria.target, criteria.requiredSessions)
      : { target: null, requiredSessions: 1 };
    return {
      id: exercise.id,
      name: exercise.name,
      level: exercise.level,
      metric: exercise.metric,
      target: parsed.target,
      requiredSessions: parsed.requiredSessions,
    };
  });

  const historyRows = await db
    .select({
      exerciseId: exercises.id,
      level: exercises.level,
      workoutId: workouts.id,
      startedAt: workouts.startedAt,
      endedAt: workouts.endedAt,
      entryId: exerciseEntries.id,
      setId: trainingSets.id,
      setIndex: trainingSets.index,
      reps: trainingSets.reps,
      durationSec: trainingSets.durationSec,
      addedLoadKg: trainingSets.addedLoadKg,
      completedAt: trainingSets.completedAt,
    })
    .from(exerciseEntries)
    .innerJoin(exercises, eq(exerciseEntries.exerciseId, exercises.id))
    .innerJoin(workouts, eq(exerciseEntries.workoutId, workouts.id))
    .leftJoin(trainingSets, eq(trainingSets.entryId, exerciseEntries.id))
    .where(and(eq(exercises.chainId, chainId), isNotNull(workouts.endedAt)))
    .orderBy(desc(workouts.startedAt), asc(trainingSets.index));

  // One chain exercise per workout is typical, but merge multiple entries for the
  // same movement so the evaluator sees the full session rather than duplicates.
  const sessionsByExercise = new Map<string, Map<string, {
    startedAt: Date;
    level: number | null;
    sets: Map<string, { index: number; reps: number | null; durationSec: number | null; addedLoadKg: number }>;
  }>>();
  for (const row of historyRows) {
    let byWorkout = sessionsByExercise.get(row.exerciseId);
    if (!byWorkout) {
      byWorkout = new Map();
      sessionsByExercise.set(row.exerciseId, byWorkout);
    }
    let session = byWorkout.get(row.workoutId);
    if (!session) {
      session = { startedAt: row.startedAt, level: row.level, sets: new Map() };
      byWorkout.set(row.workoutId, session);
    }
    if (row.setId && row.completedAt) {
      session.sets.set(row.setId, {
        index: row.setIndex ?? 0,
        reps: row.reps,
        durationSec: row.durationSec,
        addedLoadKg: row.addedLoadKg ?? 0,
      });
    }
  }

  const latestTraining = [...sessionsByExercise.entries()]
    .flatMap(([exerciseId, sessions]) => [...sessions.values()].map((session) => ({ exerciseId, ...session })))
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
  let suggestion: null | {
    exerciseId: string;
    level: number | null;
    kind: 'advance' | 'repeat' | 'increase' | 'start';
    nextExerciseName?: string;
    consecutiveSuccessfulSessions: number;
    requiredSessions: number;
    target: ProgressionTarget | null;
    suggestedTarget: ProgressionTarget | null;
  } = null;

  if (latestTraining) {
    const levelIndex = levels.findIndex((level) => level.id === latestTraining.exerciseId);
    const currentLevel = levels[levelIndex];
    if (currentLevel?.target) {
      const recentSessions = [...(sessionsByExercise.get(currentLevel.id)?.values() ?? [])]
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .map((session) => ({
          completed: true,
          sets: [...session.sets.values()]
            .sort((a, b) => a.index - b.index)
            .map(({ reps, durationSec, addedLoadKg }) => ({ reps: reps ?? undefined, durationSec: durationSec ?? undefined, addedLoadKg })),
        })) satisfies ProgressionSession[];
      const nextLevel = levels[levelIndex + 1];
      const evaluation = evaluateProgression(currentLevel.target, {
        successfulSessionsToProgress: currentLevel.requiredSessions,
        action: nextLevel
          ? { kind: 'advance_level', nextLevelId: nextLevel.id }
          : currentLevel.target.reps !== undefined
            ? { kind: 'increase_reps', amount: 1 }
            : { kind: 'increase_duration', amount: 2 },
      }, recentSessions);

      const lastSets = recentSessions[0]?.sets ?? [];
      const suggestedTarget = evaluation.eligible
        ? nextLevel ? nextLevel.target ?? currentLevel.target : increaseTarget(currentLevel.target)
        : buildSuggestedTarget(currentLevel.target, lastSets, evaluation.consecutiveSuccessfulSessions);
      suggestion = {
        exerciseId: currentLevel.id,
        level: currentLevel.level,
        kind: evaluation.eligible ? (nextLevel ? 'advance' : 'increase') : recentSessions.length ? 'repeat' : 'start',
        nextExerciseName: nextLevel?.name,
        consecutiveSuccessfulSessions: evaluation.consecutiveSuccessfulSessions,
        requiredSessions: currentLevel.requiredSessions,
        target: currentLevel.target,
        suggestedTarget,
      };
    }
  }

  return { ...chain, levels, suggestion };
}

function buildSuggestedTarget(
  target: ProgressionTarget,
  latestSets: readonly ProgressionSession['sets'][number][],
  successfulSessions: number,
): ProgressionTarget {
  const suggested = { ...target };
  // If the target has been met, repeat it until the required streak is complete.
  if (successfulSessions > 0 || latestSets.length === 0) return suggested;
  if (target.reps !== undefined) {
    const observed = latestSets.map((set) => set.reps).filter((value): value is number => value !== undefined);
    if (observed.length) suggested.reps = Math.min(target.reps, Math.min(...observed) + 1);
  }
  if (target.durationSec !== undefined) {
    const observed = latestSets.map((set) => set.durationSec).filter((value): value is number => value !== undefined);
    if (observed.length) suggested.durationSec = Math.min(target.durationSec, Math.min(...observed) + 2);
  }
  return suggested;
}

function increaseTarget(target: ProgressionTarget): ProgressionTarget {
  if (target.reps !== undefined) return { ...target, reps: target.reps + 1 };
  if (target.durationSec !== undefined) return { ...target, durationSec: target.durationSec + 2 };
  return target;
}
