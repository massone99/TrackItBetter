import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { getSessionRecords } from '../../../src/features/analytics/repository';
import type { SetRecord, VolumeRecord } from '../../../src/features/analytics/records';
import { formatRecordValue } from '../../../src/features/analytics/recordLabels';
import { getCompletedWorkout, getPreviousPerformance, type CompletedWorkout, type PreviousPerformance } from '../../../src/features/session/repository';
import { restForSet } from '../../../src/features/session/restDefaults';
import { displayWorkoutName } from '../../../src/features/session/workoutName';
import { describeSetToken } from '../../../src/features/exercises/describeSets';
import { openExercisePage } from '../../../src/features/exercises/openExercise';
import { totalProgress } from '../../../src/domain/totalGoal';
import { sessionStats, type SessionStats } from '../../../src/domain/lastTime';
import { formatRpe } from '../../../src/domain/rpe';
import { groupSets } from '../../../src/domain/setPairs';
import { ActionButton, Body, FooterAction, Icon, IconButton, Label, Numeral, Screen, SectionTitle, Text, Title } from '../../../src/shared/components/ui';
import { LoadError } from '../../../src/shared/components/LoadError';
import { useTheme } from '../../../src/shared/theme/ThemeProvider';
import { fonts } from '../../../src/shared/theme/typography';
import { useScaledStyles } from '../../../src/shared/theme/useScaledStyles';
import { formatClock, formatNumber } from '../../../src/shared/utils/format';

type Measure = 'amount' | 'rest' | 'rpe' | 'form' | 'kg';

/** Every number of one exercise in one finished workout: sets, averages, last time and records. */
export default function WorkoutEntryScreen() {
  const styles = useScaledStyles(baseStyles);
  const { entryId, workout: workoutId } = useLocalSearchParams<{ entryId: string; workout: string }>();
  const { t, i18n } = useTranslation();
  const { palette, largeText } = useTheme();
  const [workout, setWorkout] = useState<CompletedWorkout | null>(null);
  const [previous, setPrevious] = useState<PreviousPerformance | null>(null);
  const [records, setRecords] = useState<{ sets: SetRecord[]; volume: VolumeRecord[] }>({ sets: [], volume: [] });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    void Promise.all([getCompletedWorkout(workoutId), getSessionRecords(workoutId)]).then(async ([completed, session]) => {
      const exercise = completed?.exercises.find((item) => item.entryId === entryId);
      const last = exercise ? await getPreviousPerformance([exercise.exerciseId], workoutId, new Map([[exercise.exerciseId, exercise.apparatusId ?? null]])) : null;
      if (!mounted) return;
      setWorkout(completed);
      setPrevious(exercise ? last?.get(exercise.exerciseId) ?? null : null);
      setRecords(session);
      setLoading(false);
    }).catch(() => { if (mounted) { setLoadFailed(true); setLoading(false); } });
    return () => { mounted = false; };
  }, [entryId, workoutId, attempt]);

  const back = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/workout/recap/[id]', params: { id: workoutId } }));
  if (loading) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (loadFailed) return <Screen><LoadError onRetry={() => { setLoadFailed(false); setLoading(true); setAttempt((count) => count + 1); }} /></Screen>;
  const exercise = workout?.exercises.find((item) => item.entryId === entryId);
  if (!workout || !exercise) return <Screen><Title>{t('history.unavailable')}</Title><ActionButton label={t('common.back')} onPress={back} /></Screen>;

  const metric = exercise.metric;
  const timed = metric === 'time' || metric === 'time_load';
  const distance = metric === 'distance';
  const defaultRest = restForSet(exercise.exerciseId, { kind: 'working', restSec: null });
  const now = sessionStats(exercise.sets, metric, defaultRest);
  const last = previous ? sessionStats(previous.sets, metric, defaultRest) : null;
  const amount = (value: number) => (timed ? formatClock(Math.round(value)) : distance ? `${formatNumber(value)} m` : formatNumber(value));
  const format = (measure: Measure, value: number | null) => value === null ? '–'
    : measure === 'amount' ? amount(value) : measure === 'rest' ? formatClock(value) : measure === 'rpe' ? formatRpe(value) : measure === 'kg' ? `${formatNumber(value)} kg` : formatNumber(value);
  const exerciseRecords = records.sets.filter((record) => record.exerciseId === exercise.exerciseId);
  const recordSetIds = new Set(exerciseRecords.map((record) => record.setId));
  const volumeRecords = records.volume.filter((record) => record.exerciseId === exercise.exerciseId);
  const done = exercise.sets.filter((set) => set.completedAt);
  const skipped = groupSets(exercise.sets.filter((set) => !set.completedAt)).length;
  const totalLabel = timed ? t('lastTime.totalTime') : distance ? t('lastTime.totalMeters') : t('lastTime.totalReps');

  const tiles: { key: string; value: string; label: string }[] = [
    { key: 'total', value: format('amount', now.total), label: totalLabel },
    { key: 'best', value: format('amount', now.best), label: t('records.bestAmount') },
    { key: 'sets', value: now.warmups > 0 ? `${now.sets} + ${now.warmups}` : String(now.sets), label: now.warmups > 0 ? t('entryRecap.setsWarmups') : t('summary.sets') },
    { key: 'rest', value: format('rest', now.rest), label: t('lastTime.restAverage') },
    { key: 'rpe', value: format('rpe', now.rpe), label: t('lastTime.rpeAverage') },
    { key: 'form', value: format('form', now.form), label: t('entryRecap.formAverage') },
    ...(now.volumeKg !== null ? [{ key: 'volume', value: format('kg', now.volumeKg), label: t('recap.volume') }] : []),
  ];

  // Higher is better for amounts, form and volume; lower for rest; RPE is shown without a verdict.
  const rows: { key: string; label: string; measure: Measure; pick: (stats: SessionStats) => number | null; better: 'up' | 'down' | null }[] = [
    { key: 'total', label: totalLabel, measure: 'amount', pick: (stats) => stats.total, better: 'up' },
    { key: 'best', label: t('records.bestAmount'), measure: 'amount', pick: (stats) => stats.best, better: 'up' },
    { key: 'rest', label: t('lastTime.restAverage'), measure: 'rest', pick: (stats) => stats.rest, better: 'down' },
    { key: 'rpe', label: t('lastTime.rpeAverage'), measure: 'rpe', pick: (stats) => stats.rpe, better: null },
    { key: 'form', label: t('entryRecap.formAverage'), measure: 'form', pick: (stats) => stats.form, better: 'up' },
    { key: 'volume', label: t('recap.volume'), measure: 'kg', pick: (stats) => stats.volumeKg, better: 'up' },
  ];

  return (
    <Screen footer={<FooterAction icon="stats-chart-outline" label={t('entryRecap.history')} secondary onPress={() => openExercisePage(exercise.exerciseId)} />}>
      <View style={styles.header}>
        <View style={styles.topBar}>
          <IconButton icon="arrow-back" tone="plain" label={t('common.back')} onPress={back} />
        </View>
        <Label>{`${displayWorkoutName(workout.name, t('log.pastName'))} · ${workout.startedAt.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })}`}</Label>
        <Title>{exercise.name}</Title>
        {exercise.totalTarget != null ? (() => {
          const goal = totalProgress(exercise.sets, metric, exercise.totalTarget);
          return (
            <Text style={[styles.goalLine, { color: goal.reached ? palette.success : palette.warning }]}>
              {t('totalGoal.recap', { value: amount(goal.target), state: goal.reached ? t('totalGoal.recapReached') : t('totalGoal.recapMissed', { value: amount(goal.remaining) }) })}
            </Text>
          );
        })() : null}
        {exercise.notes ? <Body>{exercise.notes}</Body> : null}
      </View>

      <View style={[styles.tiles, { backgroundColor: palette.surface }]}>
        {tiles.map((tile) => (
          <View key={tile.key} style={[styles.tile, largeText && styles.tileLarge]}>
            <Numeral>{tile.value}</Numeral>
            <Label>{tile.label}</Label>
          </View>
        ))}
      </View>

      <SectionTitle title={t('entryRecap.sets')} />
      <View style={[styles.card, { backgroundColor: palette.surface }]}>
        {done.map((set, index) => {
          const record = recordSetIds.has(set.id);
          const working = set.kind !== 'warmup';
          const number = groupSets(done.filter((item) => item.kind !== 'warmup' && item.index <= set.index)).length;
          const extras = [
            set.rpe !== null ? t('logger.rpeTag', { value: formatRpe(set.rpe) }) : null,
            set.formRating !== null ? t('recap.formShort', { value: set.formRating }) : null,
            working ? t('entryRecap.rest', { value: formatClock(set.restSec ?? defaultRest) }) : null,
          ].filter(Boolean).join(' · ');
          return (
            <View key={set.id} style={[styles.setRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }, record && { backgroundColor: palette.recordSoft }]}>
              <View style={[styles.setBadge, { backgroundColor: palette.surfaceMuted }]}>
                <Text style={[styles.setBadgeText, { color: working ? palette.text : palette.textMuted }]}>{working ? number : 'W'}</Text>
              </View>
              <View style={styles.setCopy}>
                <View style={styles.setValueRow}>
                  <Text style={[styles.setValue, { color: working ? palette.text : palette.textMuted }]}>{describeSetToken({ ...set, kind: 'working', bandCount: set.bands.length }, metric)}</Text>
                  {record ? <Icon name="trophy" size={16} color={palette.record} /> : null}
                </View>
                {extras ? <Text style={[styles.setExtras, { color: palette.textMuted }]}>{extras}</Text> : null}
                {set.note ? <Text style={[styles.setExtras, { color: palette.textMuted }]}>{`“${set.note}”`}</Text> : null}
              </View>
            </View>
          );
        })}
        {skipped > 0 ? <Text style={[styles.skipped, { color: palette.textMuted, borderTopColor: palette.border }]}>{t('entryRecap.skipped', { count: skipped })}</Text> : null}
      </View>

      <SectionTitle title={previous ? t('lastTime.title', { date: previous.workoutStartedAt.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }) }) : t('entryRecap.vsLast')} />
      {last ? (
        <View style={[styles.card, { backgroundColor: palette.surface }]}>
          {rows.filter((row) => row.pick(now) !== null || row.pick(last) !== null).map((row, index) => {
            const today = row.pick(now);
            const before = row.pick(last);
            const delta = today !== null && before !== null ? Math.round((today - before) * 10) / 10 : null;
            const good = delta === null || delta === 0 || row.better === null ? null : (delta > 0) === (row.better === 'up');
            const deltaText = delta === null ? '' : delta === 0 ? '=' : `${delta > 0 ? '↑ +' : '↓ −'}${row.measure === 'amount' ? amount(Math.abs(delta)) : row.measure === 'rest' ? `${Math.abs(delta)} s` : formatNumber(Math.abs(delta))}`;
            return (
              <View key={row.key} style={[styles.compareRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }]}>
                <Text style={[styles.compareLabel, { color: palette.text }]}>{row.label}</Text>
                <View style={styles.compareValues}>
                  <Text style={[styles.compareNow, { color: palette.text }]}>{format(row.measure, today)}</Text>
                  <Text style={[styles.compareLast, { color: palette.textMuted }]}>{t('entryRecap.before', { value: format(row.measure, before) })}</Text>
                  {deltaText ? <Text style={[styles.compareDelta, { color: good === null ? palette.textMuted : good ? palette.success : palette.warning }]}>{deltaText}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : <Body>{t('entryRecap.firstTime')}</Body>}

      {exerciseRecords.length + volumeRecords.length > 0 ? (
        <>
          <SectionTitle title={t('entryRecap.records')} />
          <View style={styles.records}>
            {[...exerciseRecords.map((record) => ({ key: `${record.setId}:${record.kind}`, kind: record.kind, value: record.value, previous: record.previous })),
              ...volumeRecords.map((record) => ({ key: 'volume', kind: 'volume' as const, value: record.value, previous: record.previous }))].map((line) => (
              <View key={line.key} style={[styles.record, { backgroundColor: palette.recordSoft }]}>
                <Icon name={line.kind === 'volume' ? 'trophy-outline' : 'trophy'} size={20} color={palette.record} />
                <View style={[styles.recordCopy, largeText && styles.recordCopyLarge]}>
                  <Text style={[styles.recordName, { color: palette.text }]}>{t(`records.kinds.${line.kind}`)}</Text>
                  <Label>{t('summary.previous', { value: formatRecordValue(line.kind, line.previous, metric, t) })}</Label>
                </View>
                <Text style={[styles.recordValue, { color: palette.record }]}>{formatRecordValue(line.kind, line.value, metric, t)}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  header: { gap: 6 },
  goalLine: { fontFamily: fonts.semibold, fontSize: 15 },
  topBar: { flexDirection: 'row', marginLeft: -8 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 20, paddingVertical: 12, paddingHorizontal: 8, rowGap: 12 },
  tile: { width: '33.3%', minWidth: 96, flexGrow: 1, gap: 2, paddingHorizontal: 8 },
  card: { borderRadius: 16, overflow: 'hidden' },
  setRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  setBadge: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  setBadgeText: { fontFamily: fonts.display, fontSize: 16 },
  setCopy: { flex: 1, gap: 2 },
  setValueRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  setValue: { fontFamily: fonts.semibold, fontSize: 17, fontVariant: ['tabular-nums'] },
  setExtras: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19 },
  skipped: { fontFamily: fonts.body, fontSize: 14, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth },
  compareRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, minHeight: 48, paddingVertical: 10, paddingHorizontal: 16 },
  compareLabel: { flexGrow: 1, flexShrink: 1, minWidth: 120, fontFamily: fonts.medium, fontSize: 15 },
  compareValues: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8, rowGap: 2 },
  compareNow: { fontFamily: fonts.semibold, fontSize: 16, fontVariant: ['tabular-nums'] },
  compareLast: { fontFamily: fonts.body, fontSize: 14, fontVariant: ['tabular-nums'] },
  compareDelta: { fontFamily: fonts.semibold, fontSize: 14, fontVariant: ['tabular-nums'] },
  records: { gap: 10 },
  // Very large text: two numbers per row, and a record's value moves under its text.
  tileLarge: { width: '50%' },
  recordCopyLarge: { minWidth: '75%' },
  record: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, borderRadius: 16, padding: 16 },
  recordCopy: { flex: 1, minWidth: 160, gap: 2 },
  recordName: { fontFamily: fonts.semibold, fontSize: 16 },
  recordValue: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, fontVariant: ['tabular-nums'] },
});
