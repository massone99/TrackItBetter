import type { MovementGroupId } from '../features/exercises/movementCatalog';
import type { UserProgramSession } from './userProgram';

/**
 * Overcoming Gravity 2nd Edition (Ch. 1 & Ch. 9) adaptation zones across the unified
 * Repetition & Isometric Continuum (1 concentric rep ≈ 2 s isometric hold, up to 15 reps / 30 s).
 */
export type AdaptationZoneId = 'max_strength' | 'strength' | 'hypertrophy' | 'upper_hypertrophy' | 'endurance';

export interface AdaptationZoneInfo {
  zone: AdaptationZoneId;
  /** Broad bucket for weekly stimulus summaries. */
  bucket: 'strength' | 'hypertrophy' | 'endurance';
  /** Recommended rest interval in seconds (ATP/PCr recovery guidance). */
  restMinSec: number;
  restMaxSec: number;
  /** Equivalent amount in the opposite modality (reps ↔ seconds at 1:2), null above 15 reps / 30 s. */
  equivalent: { mode: 'reps' | 'hold'; value: number } | null;
}

/** Classifies a single set's reps or hold duration on the OG2 Repetition & Isometric Continuum. */
export function adaptationZone(mode: 'reps' | 'hold', amount: number): AdaptationZoneInfo | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const equivReps = mode === 'hold' ? amount / 2 : amount;
  const equivalent = equivReps <= 15
    ? mode === 'hold'
      ? { mode: 'reps' as const, value: Math.max(1, Math.round(equivReps)) }
      : { mode: 'hold' as const, value: Math.round(amount * 2) }
    : null;

  if (equivReps <= 3) return { zone: 'max_strength', bucket: 'strength', restMinSec: 180, restMaxSec: 300, equivalent };
  if (equivReps <= 5) return { zone: 'strength', bucket: 'strength', restMinSec: 180, restMaxSec: 240, equivalent };
  if (equivReps <= 12) return { zone: 'hypertrophy', bucket: 'hypertrophy', restMinSec: 90, restMaxSec: 180, equivalent };
  if (equivReps <= 15) return { zone: 'upper_hypertrophy', bucket: 'hypertrophy', restMinSec: 60, restMaxSec: 120, equivalent };
  return { zone: 'endurance', bucket: 'endurance', restMinSec: 30, restMaxSec: 90, equivalent: null };
}

/**
 * OG2 Ch. 9 simplified Prilepin prescription for isometric holds (60–75% of max hold)
 * alongside the 60-Second Method (50% of max hold, aimed at connective-tissue conditioning).
 */
export interface IsometricPrilepinPrescription {
  maxHoldSec: number;
  /** Standard strength/hypertrophy prescription (~65–70% of max hold). */
  prilepin: {
    holdSec: number;
    minSets: number;
    maxSets: number;
    sweetSpotSets: number;
    totalSec: number;
  };
  /** Connective-tissue-friendly alternative: ~50% of max hold adding up to 60 s. */
  sixtySecond: {
    holdSec: number;
    sets: number;
    totalSec: number;
  };
  /** True when max hold is past ~30 s (shifted toward endurance; consider a harder progression). */
  enduranceRange: boolean;
}

/** Computes OG2 Prilepin & 60-Second Method hold prescriptions from an estimated or tested max hold. */
export function isometricPrilepin(maxHoldSec: number): IsometricPrilepinPrescription | null {
  if (!Number.isFinite(maxHoldSec) || maxHoldSec < 2) return null;
  const max = Math.round(maxHoldSec);
  // 65–70% hold time (clamped to at least 2 s and strictly below max).
  const holdSec = Math.max(2, Math.min(max - 1, Math.round(max * 0.67)));
  // Target total volume scales smoothly across the OG2 chart (~25–30 s for very short holds, ~40–60 s up to 30 s max).
  const targetVolume = max <= 6 ? 24 : max <= 12 ? 36 : max <= 20 ? 45 : 60;
  const sweetSpotSets = Math.max(2, Math.min(12, Math.round(targetVolume / holdSec)));
  const minSets = Math.max(2, sweetSpotSets - 1);
  const maxSets = Math.min(12, sweetSpotSets + 1);

  const halfHold = Math.max(2, Math.min(max - 1, Math.round(max * 0.5)));
  const sixtySets = Math.max(2, Math.min(20, Math.round(60 / halfHold)));

  return {
    maxHoldSec: max,
    prilepin: {
      holdSec,
      minSets,
      maxSets,
      sweetSpotSets,
      totalSec: holdSec * sweetSpotSets,
    },
    sixtySecond: {
      holdSec: halfHold,
      sets: sixtySets,
      totalSec: halfHold * sixtySets,
    },
    enduranceRange: max > 30,
  };
}

export interface ZoneSetInput {
  metric: string;
  reps: number | null;
  durationSec: number | null;
  category?: string;
  extraCategories?: string;
}

export interface WeeklyZoneSplit {
  strength: number;
  hypertrophy: number;
  endurance: number;
  total: number;
}

function isMobilityCategory(row: Pick<ZoneSetInput, 'category' | 'extraCategories'>): boolean {
  if (row.category === 'mobility') return true;
  if (!row.extraCategories) return false;
  try {
    const parsed: unknown = JSON.parse(row.extraCategories);
    return Array.isArray(parsed) && parsed.includes('mobility');
  } catch {
    return false;
  }
}

/** Splits non-mobility completed sets across the three broad OG2 stimulus buckets. */
export function classifyWeeklyZones(rows: readonly ZoneSetInput[]): WeeklyZoneSplit {
  const split: WeeklyZoneSplit = { strength: 0, hypertrophy: 0, endurance: 0, total: 0 };
  for (const row of rows) {
    if (isMobilityCategory(row)) continue;
    const isTimed = row.metric === 'time' || row.metric === 'time_load';
    const isReps = row.metric === 'reps' || row.metric === 'reps_load';
    if (!isTimed && !isReps) continue;
    const amount = isTimed ? row.durationSec : row.reps;
    if (amount == null || amount <= 0) continue;
    const info = adaptationZone(isTimed ? 'hold' : 'reps', amount);
    if (!info) continue;
    split[info.bucket] += 1;
    split.total += 1;
  }
  return split;
}

export interface MesocycleWorkoutInput {
  id: string;
  startedAt: Date;
  sessionRpe?: number | null;
  sleep?: number | null;
  energy?: number | null;
  soreness?: number | null;
}

export interface MesocycleSetInput {
  workoutId: string;
  workoutStartedAt: Date;
  completedAt: Date | null;
  category?: string;
  extraCategories?: string;
}

export type MesocycleState = 'building' | 'deload_window' | 'deloaded';

/**
 * Fitness–Fatigue & Mesocycle status (OG2 Ch. 5, 12, 14) derived from recent weekly working sets
 * and optional workout check-in ratings (sleep, energy, soreness, session RPE).
 */
export interface MesocycleStatus {
  state: MesocycleState;
  /** Consecutive steady/high-volume weeks since the last deload/light week. */
  consecutiveHardWeeks: number;
  /** Strength sets completed in the most recent active week. */
  latestWeekSets: number;
  /** Rolling peak weekly sets across the looked-at window. */
  peakWeekSets: number;
  /** True when recent check-in logs point to elevated fatigue (high RPE/soreness or low sleep/energy). */
  elevatedFatigue: boolean;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DELOAD_RATIO = 0.6;
const LOOKBACK_WEEKS = 10;

function mondayIndex(date: Date): number {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - offset);
  return Math.floor(local.getTime() / WEEK_MS);
}

function avg(values: readonly (number | null | undefined)[]): number | null {
  const ok = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return ok.length ? ok.reduce((sum, value) => sum + value, 0) / ok.length : null;
}

/**
 * Evaluates where the user sits in an OG2 4–8 week mesocycle.
 * Returns null when there are fewer than 3 active training weeks in the recent window so new users see zero noise.
 */
export function evaluateMesocycleLoad(
  sets: readonly MesocycleSetInput[],
  workouts: readonly MesocycleWorkoutInput[],
  now = new Date(),
): MesocycleStatus | null {
  const currentWeek = mondayIndex(now);
  const startWeek = currentWeek - (LOOKBACK_WEEKS - 1);
  const setsByWeek = new Map<number, number>();
  for (const row of sets) {
    if (!row.completedAt || isMobilityCategory(row)) continue;
    const week = mondayIndex(row.workoutStartedAt);
    if (week < startWeek || week > currentWeek) continue;
    setsByWeek.set(week, (setsByWeek.get(week) ?? 0) + 1);
  }
  const activeWeeks = [...setsByWeek.entries()].filter(([, count]) => count > 0);
  if (activeWeeks.length < 3) return null;

  // Use the current week once it already has meaningful volume, else anchor on the last completed week.
  const peakWeekSets = Math.max(...activeWeeks.map(([, count]) => count));
  const currentCount = setsByWeek.get(currentWeek) ?? 0;
  const anchorWeek = currentCount >= Math.max(6, Math.round(peakWeekSets * 0.4)) ? currentWeek : currentWeek - 1;
  const latestWeekSets = setsByWeek.get(anchorWeek) ?? 0;
  const deloadThreshold = Math.max(4, peakWeekSets * DELOAD_RATIO);

  // Recent readiness signal over the last 14 days (strictly optional check-in fields).
  const twoWeeksAgo = now.getTime() - 2 * WEEK_MS;
  const recentWorkouts = workouts.filter((workout) => workout.startedAt.getTime() >= twoWeeksAgo && workout.startedAt.getTime() <= now.getTime());
  const avgRpe = avg(recentWorkouts.map((workout) => workout.sessionRpe));
  const avgSleep = avg(recentWorkouts.map((workout) => workout.sleep));
  const avgEnergy = avg(recentWorkouts.map((workout) => workout.energy));
  const avgSoreness = avg(recentWorkouts.map((workout) => workout.soreness));
  const fatigueFlags = [
    avgRpe !== null && avgRpe >= 8.5,
    avgSleep !== null && avgSleep <= 2.5,
    avgEnergy !== null && avgEnergy <= 2.5,
    avgSoreness !== null && avgSoreness >= 4,
  ].filter(Boolean).length;
  const elevatedFatigue = fatigueFlags >= 2 || (avgRpe !== null && avgRpe >= 9 && recentWorkouts.length >= 2);

  // Count consecutive hard weeks walking backwards from `anchorWeek`.
  let consecutiveHardWeeks = 0;
  for (let week = anchorWeek; week >= startWeek; week -= 1) {
    const count = setsByWeek.get(week) ?? 0;
    if (count > deloadThreshold) consecutiveHardWeeks += 1;
    else break;
  }

  // If the anchor week itself was a deload/light week right after 3+ hard weeks → supercompensation window!
  if (consecutiveHardWeeks === 0 && latestWeekSets > 0 && latestWeekSets <= deloadThreshold) {
    let priorHard = 0;
    for (let week = anchorWeek - 1; week >= startWeek; week -= 1) {
      if ((setsByWeek.get(week) ?? 0) > deloadThreshold) priorHard += 1;
      else break;
    }
    if (priorHard >= 3) {
      return { state: 'deloaded', consecutiveHardWeeks: 0, latestWeekSets, peakWeekSets, elevatedFatigue };
    }
  }

  if (consecutiveHardWeeks === 0) return null;

  const state: MesocycleState = consecutiveHardWeeks >= 5 || (consecutiveHardWeeks >= 4 && elevatedFatigue)
    ? 'deload_window'
    : 'building';
  return { state, consecutiveHardWeeks, latestWeekSets, peakWeekSets, elevatedFatigue };
}

export type BalanceNotice = 'pushHeavy' | 'pullHeavy' | 'missingHorizontalPull' | 'missingVerticalPull';

/**
 * OG2 Ch. 4 Structural Balance summary for a program or workout:
 * counts working sets by horizontal/vertical push & pull planes (ignoring warm-up and mobility).
 */
export interface ProgramPlaneBalance {
  push: number;
  pull: number;
  horizontalPush: number;
  horizontalPull: number;
  verticalPush: number;
  verticalPull: number;
  squat: number;
  hinge: number;
  notices: BalanceNotice[];
}

export function analyzeProgramBalance(
  sessions: readonly Pick<UserProgramSession, 'exercises'>[],
  groupOf: (exerciseId: string) => MovementGroupId | null | undefined,
): ProgramPlaneBalance {
  const out: ProgramPlaneBalance = {
    push: 0,
    pull: 0,
    horizontalPush: 0,
    horizontalPull: 0,
    verticalPush: 0,
    verticalPull: 0,
    squat: 0,
    hinge: 0,
    notices: [],
  };
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      if (exercise.block === 'warmup' || exercise.block === 'mobility') continue;
      const group = groupOf(exercise.exerciseId);
      if (group === 'horizontal-push') { out.horizontalPush += exercise.sets; out.push += exercise.sets; }
      else if (group === 'vertical-push') { out.verticalPush += exercise.sets; out.push += exercise.sets; }
      else if (group === 'horizontal-pull') { out.horizontalPull += exercise.sets; out.pull += exercise.sets; }
      else if (group === 'vertical-pull') { out.verticalPull += exercise.sets; out.pull += exercise.sets; }
      else if (group === 'squat') out.squat += exercise.sets;
      else if (group === 'hinge') out.hinge += exercise.sets;
    }
  }
  const upperTotal = out.push + out.pull;
  if (upperTotal >= 4) {
    if (out.push > out.pull * 1.4 && out.push - out.pull >= 3) out.notices.push('pushHeavy');
    else if (out.pull > out.push * 1.4 && out.pull - out.push >= 3) out.notices.push('pullHeavy');
    if (out.horizontalPush >= 3 && out.horizontalPull === 0) out.notices.push('missingHorizontalPull');
    if (out.verticalPush >= 3 && out.verticalPull === 0) out.notices.push('missingVerticalPull');
  }
  return out;
}
