import type { TFunction } from 'i18next';
import { formatNextStepScheme } from '../../domain/progression';
import {
  isCustomRule,
  RULE_DEFAULTS,
  type ExerciseProgressionRule,
  type ExerciseRuleSuggestion,
} from '../../domain/progressionMethods';
import { formatNumber } from '../../shared/utils/format';

const isTimed = (metric: string) => metric === 'time' || metric === 'time_load';

/** Short summary shown on a ListRow / MenuRow, e.g. "Automatic" or "Density · −15 s". */
export function ruleSummary(rule: ExerciseProgressionRule | null | undefined, metric: string, t: TFunction): string {
  if (!rule || !isCustomRule(rule)) return t('progRules.auto');
  const name = rule.method === 'auto' ? t('progRules.auto') : t(`progRules.methods.${rule.method}.name`);
  const detail = (() => {
    switch (rule.method) {
      case 'linear_load':
      case 'weight_bridge':
        return `+${formatNumber(rule.loadStepKg ?? RULE_DEFAULTS.loadStepKg)} kg`;
      case 'linear_reps':
      case 'rep_addition':
        return isTimed(metric)
          ? `+${rule.secStep ?? RULE_DEFAULTS.secStep} s`
          : `+${rule.repStep ?? RULE_DEFAULTS.repStep}`;
      case 'last_set_failure':
        return `+${rule.lastSetMargin ?? (isTimed(metric) ? RULE_DEFAULTS.lastSetMargin * 2 : RULE_DEFAULTS.lastSetMargin)}`;
      case 'additional_set':
        return `≤ ${rule.maxSets ?? RULE_DEFAULTS.maxSets}`;
      case 'density':
      case 'sets_and_density':
        return `−${rule.restStepSec ?? RULE_DEFAULTS.restStepSec} s`;
      case 'rest_pause':
        return `${rule.restPauseSec ?? RULE_DEFAULTS.restPauseSec} s`;
      case 'eccentrics':
        return `${rule.eccentricSec ?? RULE_DEFAULTS.eccentricSec} s`;
      case 'hybrid_sets':
      case 'simple_hybrid':
        return `${rule.hybridReps ?? RULE_DEFAULTS.hybridReps}+`;
      default:
        return null;
    }
  })();
  return [name, detail].filter(Boolean).join(' · ');
}

/** Formats any per-exercise progression suggestion as a single calm line. */
export function formatRuleSuggestion(suggestion: ExerciseRuleSuggestion | null | undefined, t: TFunction): { text: string; tone: 'accent' | 'warning' } | null {
  if (!suggestion) return null;
  switch (suggestion.kind) {
    case 'consolidate_form':
      return { text: t('lastTime.nextStepForm', { value: formatNumber(suggestion.avgForm) }), tone: 'warning' };
    case 'consolidate_rpe':
      return { text: t('lastTime.nextStepRpe', { value: formatNumber(suggestion.avgRpe) }), tone: 'warning' };
    case 'rep_addition':
      return { text: t('lastTime.nextStepRepAddition', { scheme: formatNextStepScheme(suggestion.scheme, suggestion.unit) }), tone: 'accent' };
    case 'linear_bump':
      return { text: t('lastTime.nextStepLinear', { scheme: formatNextStepScheme(suggestion.scheme, suggestion.unit) }), tone: 'accent' };
    case 'less_assistance':
      return { text: t('lastTime.nextStepAssist'), tone: 'accent' };
    case 'advance_hybrid':
      return { text: t('progRules.cues.hybridNamed', { reps: 1, next: suggestion.nextExerciseName }), tone: 'accent' };
    case 'add_load':
      return {
        text: t(suggestion.bridge ? 'progRules.cues.weightBridge' : 'progRules.cues.addLoad', {
          load: formatNumber(suggestion.nextLoadKg),
          step: formatNumber(suggestion.stepKg),
        }),
        tone: 'accent',
      };
    case 'last_set_ready':
      return {
        text: t('progRules.cues.lastSetReady', {
          scheme: formatNextStepScheme(suggestion.scheme, suggestion.unit),
          margin: suggestion.margin,
        }),
        tone: 'accent',
      };
    case 'last_set_aim':
      return {
        text: t(suggestion.unit === 'seconds' ? 'progRules.cues.lastSetAimSec' : 'progRules.cues.lastSetAimReps', {
          target: suggestion.targetLast,
        }),
        tone: 'accent',
      };
    case 'add_set':
      return {
        text: suggestion.amount !== null
          ? t(suggestion.unit === 'seconds' ? 'progRules.cues.addSetSec' : 'progRules.cues.addSetReps', {
            sets: suggestion.nextSets,
            amount: suggestion.amount,
          })
          : t('progRules.cues.addSetOnly', { sets: suggestion.nextSets }),
        tone: 'accent',
      };
    case 'sets_at_cap':
      return { text: t('progRules.cues.setsAtCap', { max: suggestion.maxSets }), tone: 'accent' };
    case 'reduce_rest':
      return {
        text: suggestion.alsoAddSet !== undefined
          ? t('progRules.cues.setsAndDensity', { sets: suggestion.alsoAddSet, rest: suggestion.nextRestSec })
          : t('progRules.cues.reduceRest', { rest: suggestion.nextRestSec }),
        tone: 'accent',
      };
    case 'rest_at_min':
      return { text: t('progRules.cues.restAtMin', { min: suggestion.minRestSec }), tone: 'accent' };
    case 'rest_pause':
      return { text: t('progRules.cues.restPause', { seconds: suggestion.pauseSec }), tone: 'accent' };
    case 'slow_tempo':
      return {
        text: suggestion.nextTempo
          ? t('progRules.cues.slowTempoNext', { tempo: suggestion.nextTempo })
          : t('progRules.cues.slowTempoGeneric'),
        tone: 'accent',
      };
    case 'eccentric_cluster':
      return { text: t('progRules.cues.eccentrics', { seconds: suggestion.seconds }), tone: 'accent' };
    case 'hybrid_bridge':
      return {
        text: suggestion.nextExerciseName
          ? t(suggestion.simple ? 'progRules.cues.simpleHybridNamed' : 'progRules.cues.hybridNamed', {
            reps: suggestion.reps,
            next: suggestion.nextExerciseName,
          })
          : t(suggestion.simple ? 'progRules.cues.simpleHybrid' : 'progRules.cues.hybrid', { reps: suggestion.reps }),
        tone: 'accent',
      };
    case 'method_cue':
      return {
        text: suggestion.note
          ? `${t(`progRules.methods.${suggestion.method}.name`)}: ${suggestion.note}`
          : t(`progRules.cues.${suggestion.method}`),
        tone: 'accent',
      };
  }
}
