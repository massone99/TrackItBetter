import { LoadError } from '../../../src/shared/components/LoadError';
import { displayWorkoutName } from '../../../src/features/session/workoutName';
import { aggregatePairs } from '../../../src/domain/setPairs';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { getSessionRecords, getWorkoutMobilitySeconds, getWorkoutRecords } from '../../../src/features/analytics/repository';
import type { SetRecord, VolumeRecord } from '../../../src/features/analytics/records';
import { formatRecordValue } from '../../../src/features/analytics/recordLabels';
import type { WorkoutRecord } from '../../../src/features/analytics/summary';
import { CompletedWorkout, getCompletedWorkout, getPreviousPerformance, type PreviousPerformance } from '../../../src/features/session/repository';
import { compareWithLast } from '../../../src/domain/lastTime';
import { restForSet } from '../../../src/features/session/restDefaults';
import { ActionButton, Body, Icon, Label, ListGroup, ListRow, Numeral, Screen, SectionTitle, tapFeedback, Text, Title } from '../../../src/shared/components/ui';
import { Arrive } from '../../../src/shared/components/Arrive';
import { useTheme } from '../../../src/shared/theme/ThemeProvider';
import { fonts } from '../../../src/shared/theme/typography';
import { formatBestValue } from '../../../src/shared/utils/format';
import { useScaledStyles } from '../../../src/shared/theme/useScaledStyles';
import { averageRpe, formatRpe } from '../../../src/domain/rpe';
import { openExercisePage } from '../../../src/features/exercises/openExercise';

export default function WorkoutSummaryScreen() {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [workout, setWorkout] = useState<CompletedWorkout | null>(null);
  const [records, setRecords] = useState<WorkoutRecord[]>([]);
  const [prs, setPrs] = useState<{ sets: SetRecord[]; volume: VolumeRecord[] }>({ sets: [], volume: [] });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [mobilitySeconds, setMobilitySeconds] = useState(0);
  const [previous, setPrevious] = useState<Map<string, PreviousPerformance>>(new Map());

  useEffect(() => {
    let mounted = true;
    void Promise.all([getCompletedWorkout(id), getWorkoutRecords(id), getWorkoutMobilitySeconds(id), getSessionRecords(id)]).then(async ([completed, found, mobility, session]) => {
      const last = completed ? await getPreviousPerformance(completed.exercises.map((exercise) => exercise.exerciseId), completed.id) : new Map<string, PreviousPerformance>();
      if (!mounted) return;
      setPrevious(last);
      setMobilitySeconds(mobility);
      setWorkout(completed);
      // Distance bests come from the older summary; every other record from the per-set comparison.
      const distance = found.filter((record) => record.kind === 'distance');
      setRecords(distance);
      setPrs(session);
      setLoading(false);
      const beatLastTime = (completed?.exercises ?? []).some((exercise) => {
        const before = last.get(exercise.exerciseId);
        const { improved } = compareWithLast(exercise.sets, before?.sets ?? null, exercise.metric, { defaultRest: restForSet(exercise.exerciseId, { kind: 'working', restSec: null }) });
        return improved.total || improved.rest || improved.form || improved.rpe;
      });
      if (distance.length + session.sets.length + session.volume.length > 0 || beatLastTime) tapFeedback('success');
    }).catch(() => { if (mounted) { setLoadFailed(true); setLoading(false); } });
    return () => { mounted = false; };
  }, [id, attempt]);

  const done = () => router.replace('/(tabs)/today');

  if (loading) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (loadFailed) return <Screen><LoadError onRetry={() => { setLoadFailed(false); setLoading(true); setAttempt((count) => count + 1); }} /></Screen>;
  if (!workout) return <Screen><Title>{t('summary.title')}</Title><ActionButton label={t('summary.done')} onPress={done} /></Screen>;

  const completedSets = aggregatePairs(workout.exercises.flatMap((exercise) => exercise.sets.filter((set) => set.completedAt)));
  const avgRpe = averageRpe(completedSets.map((set) => set.rpe));
  const minutes = Math.max(1, Math.round((workout.endedAt.getTime() - workout.startedAt.getTime()) / 60_000));
  const exerciseById = new Map(workout.exercises.map((exercise) => [exercise.exerciseId, exercise]));
  // One line per exercise and record kind: the best of the session (shortest, for rest).
  const bestPrs = new Map<string, SetRecord>();
  for (const record of prs.sets) {
    const key = `${record.exerciseId}:${record.kind}`;
    const current = bestPrs.get(key);
    const better = !current || (record.kind === 'shorterRest' ? record.value < current.value : record.value > current.value);
    if (better) bestPrs.set(key, record);
  }
  const prLines = [
    ...[...bestPrs.values()].map((record) => ({ key: `${record.exerciseId}:${record.kind}`, exerciseId: record.exerciseId, kind: record.kind, value: record.value, previous: record.previous })),
    ...prs.volume.map((record) => ({ key: `${record.exerciseId}:volume`, exerciseId: record.exerciseId, kind: 'volume' as const, value: record.value, previous: record.previous })),
  ];
  // Mini PRs against last time: more in total, less rest, better form, the same work at a lower RPE.
  const betterLines = workout.exercises.flatMap((exercise) => {
    const before = previous.get(exercise.exerciseId);
    const { total, rest, rpe, improved } = compareWithLast(exercise.sets, before?.sets ?? null, exercise.metric, { defaultRest: restForSet(exercise.exerciseId, { kind: 'working', restSec: null }) });
    const items = [
      improved.total && total ? t('lastTime.totalShort', { delta: Math.round(((total.now ?? 0) - total.last) * 10) / 10 }) : null,
      improved.rest && rest ? t('lastTime.restShort', { delta: rest.last - (rest.now ?? rest.last) }) : null,
      improved.form ? t('lastTime.formShort') : null,
      improved.rpe && rpe && rpe.now !== null ? t('lastTime.rpeShort', { value: formatRpe(rpe.now), last: formatRpe(rpe.last) }) : null,
    ].filter((item): item is string => item !== null);
    return items.length ? [{ entryId: exercise.entryId, exerciseId: exercise.exerciseId, name: exercise.name, items }] : [];
  });
  const hasRecords = records.length + prLines.length > 0;
  const exercisesDone = workout.exercises.filter((exercise) => exercise.sets.some((set) => set.completedAt)).length;

  return (
    <Screen>
      <View style={styles.header}>
        <Arrive>
          <View style={[styles.badge, { backgroundColor: hasRecords ? palette.recordSoft : palette.successSoft }]}>
            <Icon name={hasRecords ? 'trophy' : 'checkmark-done'} size={30} color={hasRecords ? palette.record : palette.success} />
          </View>
        </Arrive>
        <Title>{hasRecords ? t('summary.titleRecords') : t('summary.title')}</Title>
        <Body style={styles.subtitle}>{displayWorkoutName(workout.name, t('log.pastName'))}</Body>
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

      {betterLines.length > 0 ? (
        <>
          <SectionTitle title={t('lastTime.summaryTitle')} />
          <ListGroup>
            {betterLines.map((line) => (
              <ListRow
                key={line.entryId}
                icon="trending-up"
                tint={palette.success}
                title={line.name}
                subtitle={line.items.join(' · ')}
                onLongPress={() => openExercisePage(line.exerciseId)}
                longPressLabel={t('logger.openExercise')}
              />
            ))}
          </ListGroup>
        </>
      ) : null}

      {hasRecords ? (
        <>
          <SectionTitle title={t('summary.recordsTitle')} />
          <View style={styles.records}>
            {prLines.map((line) => {
              const exercise = exerciseById.get(line.exerciseId);
              const metric = exercise?.metric ?? 'reps';
              return (
                <View key={line.key} style={[styles.record, { backgroundColor: palette.recordSoft }]}>
                  <Icon name={line.kind === 'volume' ? 'trophy-outline' : 'trophy'} size={20} color={palette.record} />
                  <View style={styles.recordCopy}>
                    <Text style={styles.recordName}>{exercise?.name ?? ''}</Text>
                    <Label>{t(`records.kinds.${line.kind}`)} · {t('summary.previous', { value: formatRecordValue(line.kind, line.previous, metric, t) })}</Label>
                  </View>
                  <Text style={[styles.recordValue, { color: palette.record }]}>{formatRecordValue(line.kind, line.value, metric, t)}</Text>
                </View>
              );
            })}
            {records.map((record) => (
              <Pressable key={`${record.exerciseId}-${record.kind}`} accessible={false} accessibilityRole="none" onLongPress={() => openExercisePage(record.exerciseId)} style={[styles.record, { backgroundColor: palette.recordSoft }]}>
                <Icon name="trophy" size={20} color={palette.record} />
                <View style={styles.recordCopy}>
                  <Text style={styles.recordName}>{record.exerciseName}</Text>
                  <Label>{t('summary.previous', { value: formatBestValue({ kind: record.kind, value: record.previous }) })}</Label>
                </View>
                <Text style={[styles.recordValue, { color: palette.record }]}>{formatBestValue(record)}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : betterLines.length > 0 ? null : (
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
  header: { alignItems: 'center', gap: 10, paddingTop: 20 },
  badge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  subtitle: { fontSize: 16, textAlign: 'center' },
  stats: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 16 },
  stat: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  divider: { width: StyleSheet.hairlineWidth },
  records: { gap: 10 },
  record: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, borderRadius: 16, padding: 16 },
  recordCopy: { flex: 1, gap: 2 },
  recordName: { fontFamily: fonts.semibold, fontSize: 16 },
  recordValue: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, fontVariant: ['tabular-nums'] },
  noRecords: { textAlign: 'center', paddingHorizontal: 12 },
});
