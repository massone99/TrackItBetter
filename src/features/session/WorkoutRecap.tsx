import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { getSessionRecords, getWorkoutMobilitySeconds, getWorkoutRecords } from '../analytics/repository';
import type { SetRecord, VolumeRecord } from '../analytics/records';
import { formatRecordValue } from '../analytics/recordLabels';
import type { WorkoutRecord } from '../analytics/summary';
import { CompletedWorkout, getCompletedWorkout, getPreviousPerformance, repeatWorkoutIfIdle, type PreviousPerformance } from './repository';
import { compareWithLast, sessionStats } from '../../domain/lastTime';
import { bandRanks, compareBandHelp, type SetBand } from '../../domain/equipment';
import { getEquipment } from '../equipment/repository';
import { restForSet } from './restDefaults';
import { displayWorkoutName } from './workoutName';
import { aggregatePairs } from '../../domain/setPairs';
import { describeSets } from '../exercises/describeSets';
import { ActionButton, Body, FooterAction, Icon, IconButton, Label, ListGroup, ListRow, Numeral, Screen, SectionTitle, tapFeedback, Text, Title } from '../../shared/components/ui';
import { LoadError } from '../../shared/components/LoadError';
import { Arrive } from '../../shared/components/Arrive';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { formatBestValue, formatNumber } from '../../shared/utils/format';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { averageRpe, formatRpe } from '../../domain/rpe';
import { openExercisePage } from '../exercises/openExercise';

/**
 * The recap of one finished workout: its numbers, records, what beat last time and every exercise
 * (each opens its own detail). `finish` is the screen right after finishing (Done goes to Today);
 * `log` is the same recap opened from the Log, with Edit and Repeat.
 */
export function WorkoutRecap({ mode }: { mode: 'finish' | 'log' }) {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { palette, largeText } = useTheme();
  const [workout, setWorkout] = useState<CompletedWorkout | null>(null);
  const [records, setRecords] = useState<WorkoutRecord[]>([]);
  const [prs, setPrs] = useState<{ sets: SetRecord[]; volume: VolumeRecord[] }>({ sets: [], volume: [] });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [mobilitySeconds, setMobilitySeconds] = useState(0);
  const [previous, setPrevious] = useState<Map<string, PreviousPerformance>>(new Map());
  const [compareBands, setCompareBands] = useState<((a: readonly SetBand[], b: readonly SetBand[]) => -1 | 0 | 1 | null) | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void Promise.all([getCompletedWorkout(id), getWorkoutRecords(id), getWorkoutMobilitySeconds(id), getSessionRecords(id)]).then(async ([completed, found, mobility, session]) => {
      const last = completed ? await getPreviousPerformance(completed.exercises.map((exercise) => exercise.exerciseId), completed.id, new Map(completed.exercises.map((exercise) => [exercise.exerciseId, exercise.apparatusId ?? null] as const))) : new Map<string, PreviousPerformance>();
      const catalog = await getEquipment();
      const ranks = bandRanks(catalog.bandSets, catalog.bandOrder);
      const comparer = (a: readonly SetBand[], b: readonly SetBand[]) => compareBandHelp(a, b, ranks);
      if (!mounted) return;
      setCompareBands(() => comparer);
      setPrevious(last);
      setMobilitySeconds(mobility);
      setWorkout(completed);
      // Distance bests come from the older summary; every other record from the per-set comparison.
      const distance = found.filter((record) => record.kind === 'distance');
      setRecords(distance);
      setPrs(session);
      setLoading(false);
      if (mode !== 'finish') return;
      const beatLastTime = (completed?.exercises ?? []).some((exercise) => {
        const before = last.get(exercise.exerciseId);
        const { improved } = compareWithLast(exercise.sets, before?.sets ?? null, exercise.metric, { defaultRest: restForSet(exercise.exerciseId, { kind: 'working', restSec: null }), compareBands: comparer });
        return improved.total || improved.rest || improved.form || improved.rpe || improved.assist;
      });
      if (distance.length + session.sets.length + session.volume.length > 0 || beatLastTime) tapFeedback('success');
    }).catch(() => { if (mounted) { setLoadFailed(true); setLoading(false); } });
    return () => { mounted = false; };
  }, [id, attempt, mode]);

  const done = () => router.replace('/(tabs)/today');
  const edit = () => router.push({ pathname: '/workout/history/[id]', params: { id } });
  const repeat = () => void repeatWorkoutIfIdle(id)
    .then((result) => {
      if ('workoutId' in result) router.push({ pathname: '/workout/[id]', params: { id: result.workoutId } });
      else setNotice(t('workout.inProgressBody', { name: result.active.name }));
    })
    .catch(() => setNotice(t('history.repeatError')));

  if (loading) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (loadFailed) return <Screen><LoadError onRetry={() => { setLoadFailed(false); setLoading(true); setAttempt((count) => count + 1); }} /></Screen>;
  if (!workout) return <Screen><Title>{t('summary.title')}</Title><ActionButton label={t('summary.done')} onPress={done} /></Screen>;

  const completedSets = aggregatePairs(workout.exercises.flatMap((exercise) => exercise.sets.filter((set) => set.completedAt)));
  const avgRpe = averageRpe(completedSets.map((set) => set.rpe));
  const minutes = Math.max(1, Math.round((workout.endedAt.getTime() - workout.startedAt.getTime()) / 60_000));
  const exerciseById = new Map(workout.exercises.map((exercise) => [exercise.exerciseId, exercise]));
  const doneExercises = workout.exercises.filter((exercise) => exercise.sets.some((set) => set.completedAt));
  const stats = doneExercises.map((exercise) => ({ exercise, stats: sessionStats(exercise.sets, exercise.metric, restForSet(exercise.exerciseId, { kind: 'working', restSec: null })) }));
  const repExercises = stats.filter(({ exercise }) => exercise.metric !== 'time' && exercise.metric !== 'time_load' && exercise.metric !== 'distance');
  const totalReps = repExercises.reduce((sum, { stats: item }) => sum + (item.total ?? 0), 0);
  const volumeKg = stats.reduce((sum, { stats: item }) => sum + (item.volumeKg ?? 0), 0);
  const forms = completedSets.filter((set) => set.kind === 'working' && set.formRating !== null).map((set) => set.formRating as number);
  const roms = completedSets.filter((set) => set.kind === 'working' && set.romRating !== null).map((set) => set.romRating as number);
  const avgRom = roms.length ? Math.round((roms.reduce((sum, value) => sum + value, 0) / roms.length) * 10) / 10 : null;
  const avgForm = forms.length ? Math.round((forms.reduce((sum, value) => sum + value, 0) / forms.length) * 10) / 10 : null;
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
  const recordExercises = new Set([...prLines.map((line) => line.exerciseId), ...records.map((record) => record.exerciseId)]);
  // Mini PRs against last time: more in total, less rest, better form, the same work at a lower RPE.
  const comparisons = new Map(workout.exercises.map((exercise) => {
    const before = previous.get(exercise.exerciseId);
    return [exercise.entryId, compareWithLast(exercise.sets, before?.sets ?? null, exercise.metric, { defaultRest: restForSet(exercise.exerciseId, { kind: 'working', restSec: null }), compareBands })] as const;
  }));
  const betterLines = workout.exercises.flatMap((exercise) => {
    const { total, rest, rpe, assist, improved } = comparisons.get(exercise.entryId)!;
    const items = [
      improved.total && total ? t('lastTime.totalShort', { delta: Math.round(((total.now ?? 0) - total.last) * 10) / 10 }) : null,
      improved.rest && rest ? t('lastTime.restShort', { delta: rest.last - (rest.now ?? rest.last) }) : null,
      improved.form ? t('lastTime.formShort') : null,
      improved.assist ? (assist && assist.now !== null ? t('lastTime.assistShort', { value: Math.round((assist.last - assist.now) * 10) / 10 }) : t('lastTime.assistLighter')) : null,
      improved.rpe && rpe && rpe.now !== null ? t('lastTime.rpeShort', { value: formatRpe(rpe.now), last: formatRpe(rpe.last) }) : null,
    ].filter((item): item is string => item !== null);
    return items.length ? [{ entryId: exercise.entryId, exerciseId: exercise.exerciseId, name: exercise.name, items }] : [];
  });
  const hasRecords = records.length + prLines.length > 0;
  const recordCount = prLines.length + records.length;
  const name = displayWorkoutName(workout.name, t('log.pastName'));
  const when = `${workout.startedAt.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })} · ${workout.startedAt.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })} – ${workout.endedAt.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}`;
  type Tile = { key: string; value: number | string; label: string };
  const statTiles = ([
    { key: 'minutes', value: minutes, label: t('summary.minutes') },
    { key: 'sets', value: completedSets.filter((set) => set.kind === 'working').length, label: t('summary.sets') },
    { key: 'exercises', value: doneExercises.length, label: t('summary.exercises') },
    repExercises.length > 0 ? { key: 'reps', value: totalReps, label: t('recap.reps') } : null,
    volumeKg > 0 ? { key: 'volume', value: formatNumber(Math.round(volumeKg)), label: t('recap.volume') } : null,
    mobilitySeconds > 0 ? { key: 'mobility', value: Math.max(1, Math.round(mobilitySeconds / 60)), label: t('mobilityStats.summaryStat') } : null,
    avgRpe !== null ? { key: 'rpe', value: formatRpe(avgRpe), label: t('summary.avgRpe') } : null,
    avgForm !== null ? { key: 'form', value: formatNumber(avgForm), label: t('recap.avgForm') } : null,
    avgRom !== null ? { key: 'rom', value: formatNumber(avgRom), label: t('recap.avgRom') } : null,
  ] as (Tile | null)[]).filter((tile): tile is Tile => tile !== null);

  const footer = mode === 'log' ? (
    <>
      <FooterAction icon="create-outline" label={t('recap.edit')} secondary onPress={edit} />
      <FooterAction icon="repeat" label={t('history.repeat')} onPress={repeat} />
    </>
  ) : <FooterAction label={t('summary.done')} onPress={done} />;

  return (
    <Screen footer={footer}>
      {mode === 'finish' ? (
        <View style={styles.header}>
          <Arrive>
            <View style={[styles.badge, { backgroundColor: hasRecords ? palette.recordSoft : palette.successSoft }]}>
              <Icon name={hasRecords ? 'trophy' : 'checkmark-done'} size={30} color={hasRecords ? palette.record : palette.success} />
            </View>
          </Arrive>
          <Title>{hasRecords ? t('summary.titleRecords') : t('summary.title')}</Title>
          <Body style={styles.subtitle}>{name}</Body>
        </View>
      ) : (
        <View style={styles.logHeader}>
          <View style={styles.topBar}>
            <IconButton icon="arrow-back" tone="plain" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/log'))} />
            <IconButton icon="share-outline" tone="plain" label={t('summary.share')} onPress={() => router.push({ pathname: '/workout/share/[id]', params: { id: workout.id } })} />
          </View>
          <Label>{when}</Label>
          <Title>{name}</Title>
          {recordCount + betterLines.length > 0 ? (
            <View style={styles.badges}>
              {recordCount > 0 ? (
                <View style={[styles.pill, { backgroundColor: palette.recordSoft }]}>
                  <Icon name="trophy" size={14} color={palette.record} />
                  <Text style={[styles.pillText, { color: palette.record }]}>{t('recap.recordCount', { count: recordCount })}</Text>
                </View>
              ) : null}
              {betterLines.length > 0 ? (
                <View style={[styles.pill, { backgroundColor: palette.successSoft }]}>
                  <Icon name="trending-up" size={14} color={palette.success} />
                  <Text style={[styles.pillText, { color: palette.success }]}>{t('recap.betterCount', { count: betterLines.length })}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {notice ? <Body style={{ color: palette.warning }}>{notice}</Body> : null}
        </View>
      )}

      <View style={[styles.stats, { backgroundColor: palette.surface }]}>
        {statTiles.map((tile) => (
          <View key={tile.key} style={[styles.stat, largeText && styles.tileLarge]}>
            <Numeral>{tile.value}</Numeral>
            <Label>{tile.label}</Label>
          </View>
        ))}
      </View>

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
                  <View style={[styles.recordCopy, largeText && styles.recordCopyLarge]}>
                    <Text style={styles.recordName}>{exercise?.name ?? ''}</Text>
                    <Label>{t(`records.kinds.${line.kind}`)} · {t('summary.previous', { value: formatRecordValue(line.kind, line.previous, metric, t) })}</Label>
                  </View>
                  <Text style={[styles.recordValue, { color: palette.record }]}>{formatRecordValue(line.kind, line.value, metric, t)}</Text>
                </View>
              );
            })}
            {records.map((record) => (
              <View key={`${record.exerciseId}-${record.kind}`} style={[styles.record, { backgroundColor: palette.recordSoft }]}>
                <Icon name="trophy" size={20} color={palette.record} />
                <View style={[styles.recordCopy, largeText && styles.recordCopyLarge]}>
                  <Text style={styles.recordName}>{record.exerciseName}</Text>
                  <Label>{t('summary.previous', { value: formatBestValue({ kind: record.kind, value: record.previous }) })}</Label>
                </View>
                <Text style={[styles.recordValue, { color: palette.record }]}>{formatBestValue(record)}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

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

      {!hasRecords && betterLines.length === 0 ? <Body style={styles.noRecords}>{t('summary.noRecords')}</Body> : null}

      <SectionTitle title={t('recap.exercises')} />
      <View style={[styles.exerciseList, { backgroundColor: palette.surface }]}>
        {stats.map(({ exercise, stats: item }, index) => {
          const comparison = comparisons.get(exercise.entryId)!;
          const total = comparison.total;
          const delta = total && total.now !== null ? Math.round((total.now - total.last) * 10) / 10 : null;
          const trend = delta === null ? null : delta > 0 ? { text: `↑ +${formatNumber(delta)}`, color: palette.success } : delta < 0 ? { text: `↓ −${formatNumber(-delta)}`, color: palette.warning } : { text: '=', color: palette.textMuted };
          const detail = [
            describeSets(exercise.sets.filter((set) => set.completedAt).map((set) => ({ ...set, bandCount: set.bands.length })), exercise.metric).replace(/ {2}·  /g, ' · '),
            item.form !== null ? t('recap.formShort', { value: formatNumber(item.form) }) : null,
          ].filter(Boolean).join(' · ');
          return (
            <Pressable
              key={exercise.entryId}
              accessibilityRole="button"
              accessibilityLabel={`${exercise.name}, ${detail}${trend ? `, ${trend.text}` : ''}`}
              onPress={() => { tapFeedback(); router.push({ pathname: '/workout/entry/[entryId]', params: { entryId: exercise.entryId, workout: workout.id, exercise: exercise.exerciseId } }); }}
              style={({ pressed }) => [styles.exerciseRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }, pressed && { backgroundColor: palette.surfaceMuted }]}
            >
              <View style={styles.exerciseCopy}>
                <Text style={[styles.exerciseName, { color: palette.text }]}>{exercise.name}</Text>
                <Text style={[styles.exerciseDetail, { color: palette.textMuted }]}>{detail}</Text>
              </View>
              {recordExercises.has(exercise.exerciseId) ? <Icon name="trophy" size={16} color={palette.record} /> : null}
              {trend ? <Text style={[styles.trend, { color: trend.color }]}>{trend.text}</Text> : null}
              <Icon name="chevron-forward" size={18} color={palette.textMuted} />
            </Pressable>
          );
        })}
      </View>

      {mode === 'finish' ? (
        <ListGroup>
          <ListRow icon="share-outline" title={t('summary.share')} onPress={() => router.push({ pathname: '/workout/share/[id]', params: { id: workout.id } })} />
          <ListRow icon="create-outline" title={t('summary.details')} onPress={edit} />
        </ListGroup>
      ) : null}
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  header: { alignItems: 'center', gap: 10, paddingTop: 20 },
  logHeader: { gap: 6 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', marginLeft: -8, marginRight: -8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: 12, borderRadius: 16 },
  pillText: { fontFamily: fonts.semibold, fontSize: 14 },
  badge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  subtitle: { fontSize: 16, textAlign: 'center' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 20, paddingVertical: 12, paddingHorizontal: 8, rowGap: 12 },
  stat: { width: '33.3%', minWidth: 96, flexGrow: 1, gap: 2, paddingHorizontal: 8 },
  records: { gap: 10 },
  // Very large text: two numbers per row, and a record's value moves under its text.
  tileLarge: { width: '50%' },
  recordCopyLarge: { minWidth: '75%' },
  record: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, borderRadius: 16, padding: 16 },
  recordCopy: { flex: 1, minWidth: 160, gap: 2 },
  recordName: { fontFamily: fonts.semibold, fontSize: 16 },
  recordValue: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, fontVariant: ['tabular-nums'] },
  noRecords: { textAlign: 'center', paddingHorizontal: 12 },
  exerciseList: { borderRadius: 16, overflow: 'hidden' },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingVertical: 10, paddingHorizontal: 16 },
  exerciseCopy: { flex: 1, gap: 2 },
  exerciseName: { fontFamily: fonts.semibold, fontSize: 16 },
  exerciseDetail: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19 },
  trend: { fontFamily: fonts.semibold, fontSize: 14 },
});
