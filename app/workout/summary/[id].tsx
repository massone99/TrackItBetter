import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { getWorkoutMobilitySeconds, getWorkoutRecords } from '../../../src/features/analytics/repository';
import type { WorkoutRecord } from '../../../src/features/analytics/summary';
import { CompletedWorkout, getCompletedWorkout } from '../../../src/features/session/repository';
import { ActionButton, Body, Icon, Label, ListGroup, ListRow, Numeral, Screen, SectionTitle, tapFeedback, Text, Title } from '../../../src/shared/components/ui';
import { useTheme } from '../../../src/shared/theme/ThemeProvider';
import { fonts } from '../../../src/shared/theme/typography';
import { formatBestValue } from '../../../src/shared/utils/format';
import { useScaledStyles } from '../../../src/shared/theme/useScaledStyles';
import { averageRpe, formatRpe } from '../../../src/domain/rpe';

export default function WorkoutSummaryScreen() {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [workout, setWorkout] = useState<CompletedWorkout | null>(null);
  const [records, setRecords] = useState<WorkoutRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobilitySeconds, setMobilitySeconds] = useState(0);

  useEffect(() => {
    let mounted = true;
    void Promise.all([getCompletedWorkout(id), getWorkoutRecords(id), getWorkoutMobilitySeconds(id)]).then(([completed, found, mobility]) => {
      if (!mounted) return;
      setMobilitySeconds(mobility);
      setWorkout(completed);
      setRecords(found);
      setLoading(false);
      if (found.length > 0) tapFeedback('success');
    }).catch(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [id]);

  const done = () => router.replace('/(tabs)/today');

  if (loading) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (!workout) return <Screen><Title>{t('summary.title')}</Title><ActionButton label={t('summary.done')} onPress={done} /></Screen>;

  const completedSets = workout.exercises.flatMap((exercise) => exercise.sets.filter((set) => set.completedAt));
  const avgRpe = averageRpe(completedSets.map((set) => set.rpe));
  const minutes = Math.max(1, Math.round((workout.endedAt.getTime() - workout.startedAt.getTime()) / 60_000));
  const exercisesDone = workout.exercises.filter((exercise) => exercise.sets.some((set) => set.completedAt)).length;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: records.length ? palette.recordSoft : palette.accentSoft }]}>
          <Icon name={records.length ? 'trophy' : 'checkmark-done'} size={30} color={records.length ? palette.record : palette.accentStrong} />
        </View>
        <Title>{t('summary.title')}</Title>
        <Body style={styles.subtitle}>{workout.name}</Body>
      </View>

      <View style={[styles.stats, { borderColor: palette.border }]}>
        <Stat value={minutes} label={t('summary.minutes')} />
        <View style={[styles.divider, { backgroundColor: palette.border }]} />
        <Stat value={completedSets.length} label={t('summary.sets')} />
        <View style={[styles.divider, { backgroundColor: palette.border }]} />
        <Stat value={exercisesDone} label={t('summary.exercises')} />
        {mobilitySeconds > 0 ? (
          <>
            <View style={[styles.divider, { backgroundColor: palette.border }]} />
            <Stat value={Math.max(1, Math.round(mobilitySeconds / 60))} label={t('mobilityStats.summaryStat')} />
          </>
        ) : null}
        {avgRpe !== null ? (
          <>
            <View style={[styles.divider, { backgroundColor: palette.border }]} />
            <Stat value={formatRpe(avgRpe)} label={t('summary.avgRpe')} />
          </>
        ) : null}
      </View>

      {records.length > 0 ? (
        <>
          <SectionTitle title={t('summary.recordsTitle')} />
          <View style={styles.records}>
            {records.map((record) => (
              <View key={`${record.exerciseId}-${record.kind}`} style={[styles.record, { backgroundColor: palette.recordSoft }]}>
                <Icon name="trophy" size={20} color={palette.record} />
                <View style={styles.recordCopy}>
                  <Text style={styles.recordName}>{record.exerciseName}</Text>
                  <Label>{t('summary.previous', { value: formatBestValue({ kind: record.kind, value: record.previous }) })}</Label>
                </View>
                <Text style={[styles.recordValue, { color: palette.record }]}>{formatBestValue(record)}</Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <Body style={styles.noRecords}>{t('summary.noRecords')}</Body>
      )}

      <ListGroup>
        <ListRow icon="share-outline" title={t('summary.share')} onPress={() => router.push({ pathname: '/workout/share/[id]', params: { id: workout.id } })} />
        <ListRow icon="create-outline" title={t('summary.details')} onPress={() => router.push({ pathname: '/workout/history/[id]', params: { id: workout.id } })} />
      </ListGroup>
      <ActionButton label={t('summary.done')} onPress={done} />
    </Screen>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  const styles = useScaledStyles(baseStyles);
  return (
    <View style={styles.stat}>
      <Numeral>{value}</Numeral>
      <Label>{label}</Label>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  header: { alignItems: 'center', gap: 8, paddingTop: 24 },
  badge: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  subtitle: { fontSize: 16 },
  stats: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 16 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  divider: { width: StyleSheet.hairlineWidth },
  records: { gap: 10 },
  record: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 16 },
  recordCopy: { flex: 1, gap: 2 },
  recordName: { fontFamily: fonts.semibold, fontSize: 16 },
  recordValue: { fontFamily: fonts.display, fontSize: 28 },
  noRecords: { textAlign: 'center', paddingHorizontal: 12 },
});
