import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { isTimedMetric } from '../../domain/userProgram';
import { DurationField } from '../../shared/components/DateTimePickers';
import { Chip, Stepper } from '../../shared/components/ui';
import { formatClock } from '../../shared/utils/format';

/** A total goal for an exercise: total reps (with quick values), total time or total meters. */
export function TotalTargetField({ metric, value, onChange }: { metric: string; value: number; onChange: (value: number) => void }) {
  const { t } = useTranslation();
  if (isTimedMetric(metric)) {
    return <DurationField label={t('programBuilder.totalTime')} value={value} min={10} max={3600} step={10} presets={[60, 120, 180, 300]} format={formatClock} onChange={onChange} />;
  }
  if (metric === 'distance') {
    return <Stepper layout="row" label={t('programBuilder.totalMeters')} value={value} display={t('userProgram.metersValue', { value })} step={100} min={10} max={100000} editable onChange={onChange} />;
  }
  return (
    <View style={styles.total}>
      <Stepper layout="row" label={t('programBuilder.totalReps')} value={value} step={5} min={1} max={2000} editable onChange={(next) => onChange(Math.max(1, Math.round(next)))} />
      <View style={styles.presets}>
        {[20, 30, 40, 50, 100].map((preset) => <View key={preset} style={styles.preset}><Chip label={String(preset)} selected={value === preset} onPress={() => onChange(preset)} /></View>)}
      </View>
    </View>
  );
}

/** Where a new total goal starts: the per-set target times the sets (at least three), else a round default. */
export function totalDefaultFor(metric: string, perSet: number | null, sets: number): number {
  if (perSet != null) return perSet * Math.max(sets, 3);
  return isTimedMetric(metric) ? 120 : metric === 'distance' ? 1000 : 50;
}

const styles = StyleSheet.create({
  total: { gap: 8 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { width: '18%', minWidth: 56, flexGrow: 1 },
});
