import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import type { TFunction } from 'i18next';
import { SegmentedControl, Stepper, SwitchRow } from '../../shared/components/ui';
import { formatClock } from '../../shared/utils/format';
import type { Criteria } from './chains';
import type { LinkProblem } from '../../domain/progressionGraph';

export const DEFAULT_CRITERIA: Criteria = { sets: 3, reps: 8, requiredSessions: 2 };

/** "3 × 8 · 2 sessions" or "3 × 0:20 · 1 session"; null when no criteria are set. */
export function criteriaText(criteria: Criteria | null, t: TFunction): string | null {
  if (!criteria) return null;
  const amount = criteria.seconds !== undefined ? formatClock(criteria.seconds) : t('chains.repsShort', { count: criteria.reps ?? 1 });
  return `${criteria.sets} × ${amount} · ${t('chains.sessions', { count: criteria.requiredSessions })}`;
}

/** Why the graph refused a change, in words, naming the exercises of a loop (A → B → A). */
export function graphProblemText(problem: LinkProblem | { kind: 'inChain' }, nameOf: (id: string) => string, t: TFunction): string {
  if (problem.kind === 'cycle') return t('chains.errorCycle', { path: problem.path.map(nameOf).join(' → ') });
  if (problem.kind === 'self') return t('chains.errorSelf');
  if (problem.kind === 'inChain') return t('chains.errorInChain');
  return t('chains.errorDuplicate');
}

/** What to reach before moving on: off, or sets of reps or seconds over some sessions in a row. */
export function CriteriaEditor({ value, onChange }: { value: Criteria | null; onChange: (next: Criteria | null) => void }) {
  const { t } = useTranslation();
  const unit = value?.seconds !== undefined ? 'seconds' : 'reps';
  return (
    <View style={styles.box}>
      <SwitchRow title={t('chains.criteriaTitle')} subtitle={t('chains.criteriaHint')} value={value !== null} onChange={(on) => onChange(on ? DEFAULT_CRITERIA : null)} />
      {value ? (
        <>
          <SegmentedControl
            value={unit}
            options={[{ value: 'reps', label: t('chains.unitReps') }, { value: 'seconds', label: t('chains.unitSeconds') }]}
            onChange={(next) => onChange(next === 'seconds' ? { sets: value.sets, seconds: 20, requiredSessions: value.requiredSessions } : { sets: value.sets, reps: 8, requiredSessions: value.requiredSessions })}
          />
          <Stepper label={t('chains.sets')} layout="row" value={value.sets} min={1} max={20} onChange={(sets) => onChange({ ...value, sets: Math.round(sets) })} />
          {unit === 'seconds' ? (
            <Stepper label={t('chains.seconds')} layout="row" value={value.seconds ?? 20} display={formatClock(value.seconds ?? 20)} step={5} min={5} max={3600} editable clock onChange={(seconds) => onChange({ ...value, seconds: Math.max(1, Math.round(seconds)) })} />
          ) : (
            <Stepper label={t('chains.reps')} layout="row" value={value.reps ?? 8} min={1} max={1000} editable onChange={(reps) => onChange({ ...value, reps: Math.max(1, Math.round(reps)) })} />
          )}
          <Stepper label={t('chains.sessionsInRow')} layout="row" value={value.requiredSessions} min={1} max={20} onChange={(count) => onChange({ ...value, requiredSessions: Math.round(count) })} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12 },
});
