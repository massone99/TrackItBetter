import { suggestNextStep, type NextStepInput, type NextStepSuggestion, type ProgressionSet } from './progression';

export type ProgressionFamily = 'intra' | 'inter' | 'complex';
export const PROGRESSION_FAMILIES: readonly ProgressionFamily[] = ['intra', 'inter', 'complex'];

/** All 21 bodyweight progression methods organized across intra-exercise, inter-exercise, and periodization families. */
export type ProgressionMethodId =
  // Simple Intra-Exercise (9)
  | 'linear_load'
  | 'linear_reps'
  | 'rep_addition'
  | 'last_set_failure'
  | 'additional_set'
  | 'rest_pause'
  | 'density'
  | 'tempo'
  | 'frequency'
  // Simple Inter-Exercise (8)
  | 'weight_bridge'
  | 'assistance'
  | 'eccentrics'
  | 'momentum_rom'
  | 'variation'
  | 'sets_and_density'
  | 'hybrid_sets'
  | 'simple_hybrid'
  // Complex / Periodization (4)
  | 'accumulation_intensification'
  | 'light_heavy'
  | 'dup'
  | 'concurrent_conjugate';

export type RuleParamKey =
  | 'repStep'
  | 'secStep'
  | 'loadStepKg'
  | 'lastSetMargin'
  | 'maxSets'
  | 'restStepSec'
  | 'minRestSec'
  | 'restPauseSec'
  | 'eccentricSec'
  | 'hybridReps';

export interface ProgressionMethodMeta {
  id: ProgressionMethodId;
  family: ProgressionFamily;
  /** Parameters exposed in the UI when this method is chosen. */
  params: readonly RuleParamKey[];
}

export const PROGRESSION_METHODS: readonly ProgressionMethodMeta[] = [
  // Simple intra-exercise
  { id: 'linear_load', family: 'intra', params: ['loadStepKg'] },
  { id: 'linear_reps', family: 'intra', params: ['repStep', 'secStep'] },
  { id: 'rep_addition', family: 'intra', params: ['repStep', 'secStep'] },
  { id: 'last_set_failure', family: 'intra', params: ['lastSetMargin', 'repStep', 'secStep'] },
  { id: 'additional_set', family: 'intra', params: ['maxSets'] },
  { id: 'rest_pause', family: 'intra', params: ['restPauseSec'] },
  { id: 'density', family: 'intra', params: ['restStepSec', 'minRestSec'] },
  { id: 'tempo', family: 'intra', params: [] },
  { id: 'frequency', family: 'intra', params: [] },
  // Simple inter-exercise
  { id: 'weight_bridge', family: 'inter', params: ['loadStepKg'] },
  { id: 'assistance', family: 'inter', params: [] },
  { id: 'eccentrics', family: 'inter', params: ['eccentricSec'] },
  { id: 'momentum_rom', family: 'inter', params: [] },
  { id: 'variation', family: 'inter', params: [] },
  { id: 'sets_and_density', family: 'inter', params: ['maxSets', 'restStepSec', 'minRestSec'] },
  { id: 'hybrid_sets', family: 'inter', params: ['hybridReps'] },
  { id: 'simple_hybrid', family: 'inter', params: ['hybridReps'] },
  // Complex / Periodization
  { id: 'accumulation_intensification', family: 'complex', params: [] },
  { id: 'light_heavy', family: 'complex', params: [] },
  { id: 'dup', family: 'complex', params: [] },
  { id: 'concurrent_conjugate', family: 'complex', params: [] },
];

export const PROGRESSION_METHOD_BY_ID: ReadonlyMap<ProgressionMethodId, ProgressionMethodMeta> = new Map(
  PROGRESSION_METHODS.map((method) => [method.id, method]),
);

/** User-configurable progression rule bound to a single exercise. */
export interface ExerciseProgressionRule {
  method: ProgressionMethodId | 'auto';
  repStep?: number;
  secStep?: number;
  loadStepKg?: number;
  lastSetMargin?: number;
  maxSets?: number;
  restStepSec?: number;
  minRestSec?: number;
  restPauseSec?: number;
  eccentricSec?: number;
  hybridReps?: number;
  /** Minimum average form rating (1–5) required before progressing; null/undefined uses default guard. */
  minForm?: number | null;
  /** Maximum average RPE (6–10) allowed before progressing; null/undefined uses default guard. */
  maxRpe?: number | null;
  /** Optional personal cue (e.g. "lean 5 cm further", "add 1 ring turn-out notch"). */
  note?: string | null;
}

export const DEFAULT_EXERCISE_RULE: ExerciseProgressionRule = { method: 'auto' };

export const RULE_DEFAULTS = {
  repStep: 1,
  secStep: 2,
  loadStepKg: 2.5,
  lastSetMargin: 2,
  maxSets: 5,
  restStepSec: 15,
  minRestSec: 60,
  restPauseSec: 15,
  eccentricSec: 7,
  hybridReps: 1,
} as const;

const NOTE_MAX = 200;

function clampNum(value: unknown, min: number, max: number, step?: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const clamped = Math.min(max, Math.max(min, value));
  return step ? Math.round(clamped / step) * step : Math.round(clamped * 100) / 100;
}

/** Validates and normalizes a raw rule object (from storage or form edits). */
export function sanitizeExerciseRule(raw: unknown): ExerciseProgressionRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const method = obj.method === 'auto' || (typeof obj.method === 'string' && PROGRESSION_METHOD_BY_ID.has(obj.method as ProgressionMethodId))
    ? (obj.method as ExerciseProgressionRule['method'])
    : null;
  if (!method) return null;
  const rule: ExerciseProgressionRule = { method };
  const repStep = clampNum(obj.repStep, 1, 10, 1);
  if (repStep !== undefined) rule.repStep = repStep;
  const secStep = clampNum(obj.secStep, 1, 30, 1);
  if (secStep !== undefined) rule.secStep = secStep;
  const loadStepKg = clampNum(obj.loadStepKg, 0.25, 25, 0.25);
  if (loadStepKg !== undefined) rule.loadStepKg = loadStepKg;
  const lastSetMargin = clampNum(obj.lastSetMargin, 1, 10, 1);
  if (lastSetMargin !== undefined) rule.lastSetMargin = lastSetMargin;
  const maxSets = clampNum(obj.maxSets, 2, 15, 1);
  if (maxSets !== undefined) rule.maxSets = maxSets;
  const restStepSec = clampNum(obj.restStepSec, 5, 60, 5);
  if (restStepSec !== undefined) rule.restStepSec = restStepSec;
  const minRestSec = clampNum(obj.minRestSec, 15, 300, 5);
  if (minRestSec !== undefined) rule.minRestSec = minRestSec;
  const restPauseSec = clampNum(obj.restPauseSec, 5, 45, 5);
  if (restPauseSec !== undefined) rule.restPauseSec = restPauseSec;
  const eccentricSec = clampNum(obj.eccentricSec, 3, 20, 1);
  if (eccentricSec !== undefined) rule.eccentricSec = eccentricSec;
  const hybridReps = clampNum(obj.hybridReps, 1, 5, 1);
  if (hybridReps !== undefined) rule.hybridReps = hybridReps;
  const minForm = obj.minForm === null ? null : clampNum(obj.minForm, 1, 5, 0.5);
  if (minForm !== undefined && minForm !== null) rule.minForm = minForm;
  const maxRpe = obj.maxRpe === null ? null : clampNum(obj.maxRpe, 6, 10, 0.5);
  if (maxRpe !== undefined && maxRpe !== null) rule.maxRpe = maxRpe;
  if (typeof obj.note === 'string') {
    const clean = obj.note.trim().slice(0, NOTE_MAX);
    if (clean) rule.note = clean;
  }
  return rule;
}

/** True when the rule differs from the default 'auto' with no custom gates or note. */
export function isCustomRule(rule: ExerciseProgressionRule | null | undefined): boolean {
  if (!rule) return false;
  return rule.method !== 'auto' || rule.minForm != null || rule.maxRpe != null || Boolean(rule.note?.trim());
}

export interface ExerciseRuleSet extends ProgressionSet {
  restSec?: number | null;
  tempo?: string | null;
}

export interface ExerciseRuleInput extends Omit<NextStepInput, 'sets'> {
  sets: readonly ExerciseRuleSet[];
  /** Fallback rest in seconds when a set has no explicit restSec. */
  defaultRestSec?: number;
}

export type ExerciseRuleSuggestion =
  | NextStepSuggestion
  | { kind: 'add_load'; nextLoadKg: number; stepKg: number; bridge: boolean }
  | { kind: 'last_set_ready'; scheme: number[]; unit: 'reps' | 'seconds'; margin: number }
  | { kind: 'last_set_aim'; targetLast: number; unit: 'reps' | 'seconds'; margin: number }
  | { kind: 'add_set'; nextSets: number; amount: number | null; unit: 'reps' | 'seconds' }
  | { kind: 'sets_at_cap'; maxSets: number }
  | { kind: 'reduce_rest'; nextRestSec: number; stepSec: number; alsoAddSet?: number }
  | { kind: 'rest_at_min'; minRestSec: number }
  | { kind: 'rest_pause'; pauseSec: number }
  | { kind: 'slow_tempo'; nextTempo: string | null }
  | { kind: 'eccentric_cluster'; seconds: number }
  | { kind: 'hybrid_bridge'; reps: number; simple: boolean; nextExerciseName?: string | null }
  | { kind: 'method_cue'; method: ProgressionMethodId; note?: string | null };

function meanOf(values: readonly (number | null | undefined)[]): number | null {
  const ok = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return ok.length ? ok.reduce((sum, value) => sum + value, 0) / ok.length : null;
}

const TEMPO_LADDER = ['10X0', '20X0', '30X0', '40X0', '50X0'] as const;

function nextTempoFrom(last: string | null | undefined): string | null {
  if (!last) return null;
  const upper = last.trim().toUpperCase();
  const idx = TEMPO_LADDER.indexOf(upper as (typeof TEMPO_LADDER)[number]);
  if (idx >= 0 && idx + 1 < TEMPO_LADDER.length) return TEMPO_LADDER[idx + 1];
  return null;
}

/**
 * Evaluates a user-configured per-exercise progression rule against the last session's sets.
 * Falls back to `suggestNextStep` when `rule` is null or `method === 'auto'`.
 */
export function evaluateExerciseRule(
  rule: ExerciseProgressionRule | null | undefined,
  input: ExerciseRuleInput,
): ExerciseRuleSuggestion | null {
  if (input.sets.length === 0) return null;

  // Quality gates (user overrides if set on the rule, else OG2 defaults: form < 3.5, RPE >= 9.5).
  const formFloor = rule?.minForm ?? 3.5;
  const rpeCeiling = rule?.maxRpe ?? 9.5;
  const avgForm = meanOf(input.sets.map((set) => set.formRating));
  if (avgForm !== null && avgForm < formFloor) {
    return { kind: 'consolidate_form', avgForm: Math.round(avgForm * 10) / 10 };
  }
  const avgRpe = meanOf(input.sets.map((set) => set.rpe));
  if (avgRpe !== null && (rule?.maxRpe != null ? avgRpe > rpeCeiling : avgRpe >= rpeCeiling)) {
    return { kind: 'consolidate_rpe', avgRpe: Math.round(avgRpe * 10) / 10 };
  }

  if (!rule || rule.method === 'auto') {
    return suggestNextStep(input);
  }

  const isTimed = input.metric === 'time' || input.metric === 'time_load';
  const unit: 'reps' | 'seconds' = isTimed ? 'seconds' : 'reps';
  const step = isTimed ? (rule.secStep ?? RULE_DEFAULTS.secStep) : (rule.repStep ?? RULE_DEFAULTS.repStep);
  const amounts = input.sets
    .map((set) => (isTimed ? set.durationSec : set.reps))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value));

  switch (rule.method) {
    case 'linear_load':
    case 'weight_bridge': {
      const stepKg = rule.loadStepKg ?? RULE_DEFAULTS.loadStepKg;
      const lastLoad = Math.max(0, ...input.sets.map((set) => set.addedLoadKg ?? 0));
      const nextLoadKg = Math.round((lastLoad + stepKg) * 100) / 100;
      return { kind: 'add_load', nextLoadKg, stepKg, bridge: rule.method === 'weight_bridge' };
    }
    case 'linear_reps': {
      if (amounts.length === 0) return null;
      return { kind: 'linear_bump', scheme: amounts.map((value) => value + step), unit };
    }
    case 'rep_addition': {
      if (amounts.length === 0) return null;
      const maxAmount = Math.max(...amounts);
      const unevenIndex = amounts.findIndex((value) => value < maxAmount);
      const scheme = [...amounts];
      if (amounts.length >= 2 && unevenIndex >= 0) {
        scheme[unevenIndex] = Math.min(maxAmount, scheme[unevenIndex] + step);
      } else {
        scheme[0] += step;
      }
      return { kind: 'rep_addition', scheme, unit };
    }
    case 'last_set_failure': {
      if (amounts.length < 2) return amounts.length === 1 ? { kind: 'linear_bump', scheme: [amounts[0] + step], unit } : null;
      const margin = rule.lastSetMargin ?? (isTimed ? RULE_DEFAULTS.lastSetMargin * 2 : RULE_DEFAULTS.lastSetMargin);
      const priorBase = Math.min(...amounts.slice(0, -1));
      const last = amounts[amounts.length - 1];
      if (last >= priorBase + margin) {
        return { kind: 'last_set_ready', scheme: amounts.map(() => priorBase + step), unit, margin };
      }
      return { kind: 'last_set_aim', targetLast: priorBase + margin, unit, margin };
    }
    case 'additional_set': {
      const maxSets = rule.maxSets ?? RULE_DEFAULTS.maxSets;
      if (input.sets.length < maxSets) {
        return { kind: 'add_set', nextSets: input.sets.length + 1, amount: amounts[0] ?? null, unit };
      }
      return { kind: 'sets_at_cap', maxSets };
    }
    case 'rest_pause':
      return { kind: 'rest_pause', pauseSec: rule.restPauseSec ?? RULE_DEFAULTS.restPauseSec };
    case 'density': {
      const restStep = rule.restStepSec ?? RULE_DEFAULTS.restStepSec;
      const minRest = rule.minRestSec ?? RULE_DEFAULTS.minRestSec;
      const avgRest = meanOf(input.sets.map((set) => set.restSec ?? input.defaultRestSec));
      if (avgRest === null) return { kind: 'reduce_rest', nextRestSec: minRest, stepSec: restStep };
      const current = Math.round(avgRest);
      if (current <= minRest) return { kind: 'rest_at_min', minRestSec: minRest };
      return { kind: 'reduce_rest', nextRestSec: Math.max(minRest, current - restStep), stepSec: restStep };
    }
    case 'sets_and_density': {
      const maxSets = rule.maxSets ?? RULE_DEFAULTS.maxSets;
      const restStep = rule.restStepSec ?? RULE_DEFAULTS.restStepSec;
      const minRest = rule.minRestSec ?? RULE_DEFAULTS.minRestSec;
      const avgRest = meanOf(input.sets.map((set) => set.restSec ?? input.defaultRestSec));
      const nextSets = input.sets.length < maxSets ? input.sets.length + 1 : undefined;
      if (avgRest !== null && Math.round(avgRest) > minRest) {
        return { kind: 'reduce_rest', nextRestSec: Math.max(minRest, Math.round(avgRest) - restStep), stepSec: restStep, alsoAddSet: nextSets };
      }
      if (nextSets !== undefined) {
        return { kind: 'add_set', nextSets, amount: amounts[0] ?? null, unit };
      }
      return { kind: 'sets_at_cap', maxSets };
    }
    case 'tempo': {
      const lastTempo = input.sets.find((set) => set.tempo)?.tempo ?? null;
      return { kind: 'slow_tempo', nextTempo: nextTempoFrom(lastTempo) };
    }
    case 'assistance':
      return { kind: 'less_assistance' };
    case 'eccentrics':
      return { kind: 'eccentric_cluster', seconds: rule.eccentricSec ?? RULE_DEFAULTS.eccentricSec };
    case 'hybrid_sets':
      return { kind: 'hybrid_bridge', reps: rule.hybridReps ?? RULE_DEFAULTS.hybridReps, simple: false, nextExerciseName: input.nextExerciseName ?? null };
    case 'simple_hybrid':
      return { kind: 'hybrid_bridge', reps: rule.hybridReps ?? RULE_DEFAULTS.hybridReps, simple: true, nextExerciseName: input.nextExerciseName ?? null };
    case 'frequency':
    case 'momentum_rom':
    case 'variation':
    case 'accumulation_intensification':
    case 'light_heavy':
    case 'dup':
    case 'concurrent_conjugate':
      return { kind: 'method_cue', method: rule.method, note: rule.note ?? null };
  }
}
