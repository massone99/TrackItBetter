import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { Exercise } from '../../src/db/schema';
import { openReferenceVideo, ReferenceLinkSheet } from '../../src/features/exercises/ReferenceLinkSheet';
import { movementTagLabel } from '../../src/features/exercises/ClassificationChoices';
import { exerciseMovementTags } from '../../src/features/exercises/movementCatalog';
import { getExerciseById, setExerciseFavourite } from '../../src/features/exercises/repository';
import { canTransfer, deleteExerciseWithHistory, getExerciseUsage, hideExercise, metricAfterTransfer, transferExerciseHistory, type ExerciseUsage } from '../../src/features/exercises/lifecycle';
import { ExercisePicker, type ExerciseChoice } from '../../src/features/exercises/ExercisePicker';
import { HistoryRow } from '../../src/features/exercises/HistoryRow';
import { addExerciseToWorkout, getActiveWorkout, startWorkout } from '../../src/features/session/repository';
import { getExerciseCycle, getExerciseEstimate, getExerciseHistory, getExerciseRecordSummary, getExerciseWeekStats, type ExerciseHistorySession } from '../../src/features/analytics/repository';
import type { ExerciseRecordSummary } from '../../src/features/analytics/records';
import { repsAtLoadFromHistory } from '../../src/features/analytics/repsAtLoad';
import { RepsAtLoadCard } from '../../src/features/analytics/components/RepsAtLoadCard';
import { formatRecordValue } from '../../src/features/analytics/recordLabels';
import type { ExerciseEstimate } from '../../src/features/analytics/estimates';
import type { ExerciseCycle, ExerciseWeek } from '../../src/features/analytics/mobility';
import { formatMinutes, formatNumber } from '../../src/shared/utils/format';
import { formatRpe } from '../../src/domain';
import { ActionButton, Body, Icon, IconButton, ListGroup, ListRow, PageHeading, Screen, SectionTitle, SegmentedControl, Sheet, SwitchRow, Text, Toast } from '../../src/shared/components/ui';
import { aggregatePairs, type PairScope } from '../../src/domain/setPairs';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { fonts } from '../../src/shared/theme/typography';
import { linkHost } from '../../src/shared/utils/url';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';
import { goBack } from '../../src/shared/navigation/goBack';

function readList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function historyForScope(history: readonly ExerciseHistorySession[], scope: PairScope): ExerciseHistorySession[] {
  const hasPairs = history.some((session) => session.sets.some((s) => s.pairId));
  return history.map((session) => {
    return { ...session, sets: aggregatePairs(scope === 'average' && hasPairs ? session.sets.filter((s) => s.pairId) : session.sets, scope) };
  });
}

export default function ExerciseRoute() {
  const styles = useScaledStyles(baseStyles);
  const { id, notice } = useLocalSearchParams<{ id: string; notice?: string }>();
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState<ExerciseWeek | null>(null);
  const [cycle, setCycle] = useState<{ current: ExerciseCycle | null; previous: ExerciseCycle | null } | null>(null);
  const [estimate, setEstimate] = useState<ExerciseEstimate | null>(null);
  const [records, setRecords] = useState<ExerciseRecordSummary | null>(null);
  const [editingReference, setEditingReference] = useState(false);
  const [history, setHistory] = useState<ExerciseHistorySession[]>([]);
  const [pairScope, setPairScope] = useState<PairScope>('average');
  const scopedHistory = useMemo(() => historyForScope(history, pairScope), [history, pairScope]);
  const loadProgress = useMemo(() => repsAtLoadFromHistory(scopedHistory), [scopedHistory]);
  const [usage, setUsage] = useState<ExerciseUsage | null>(null);
  // Removal: 'choose' offers hide or delete, 'delete' asks once more before deleting history.
  const [removal, setRemoval] = useState<'choose' | 'delete' | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTo, setTransferTo] = useState<ExerciseChoice | null>(null);
  const [deleteSource, setDeleteSource] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(notice ?? null);

  const reload = useCallback(async () => {
    const found = await getExerciseById(id);
    setExercise(found);
    setLoading(false);
    // Mobility and stretching count their own week from the first day trained; the rest the last 7 days.
    if (found && [found.category, ...readList(found.extraCategories)].includes('mobility')) setCycle(await getExerciseCycle(found.id, undefined, pairScope).catch(() => null));
    else if (found) setWeek(await getExerciseWeekStats(found.id, found.metric, undefined, pairScope).catch(() => null));
    if (found) setEstimate(await getExerciseEstimate(found.id, undefined, pairScope).catch(() => null));
    if (found) setRecords(await getExerciseRecordSummary(found.id, pairScope).catch(() => null));
    if (found) setHistory(await getExerciseHistory(found.id).catch(() => []));
    if (found) setUsage(await getExerciseUsage(found.id).catch(() => null));
  }, [id, pairScope]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const beginWithExercise = async () => {
    if (!exercise) return;
    const active = await getActiveWorkout();
    const workoutId = active?.id ?? await startWorkout();
    await addExerciseToWorkout(workoutId, exercise.id);
    router.push({ pathname: '/workout/[id]', params: { id: workoutId } });
  };

  const hide = async () => {
    if (!exercise) return;
    setRemoval(null);
    await hideExercise(exercise.id);
    goBack({ pathname: '/programs', params: { view: 'exercises' } });
  };

  const deleteAll = async () => {
    if (!exercise || busy) return;
    setBusy(true);
    try {
      await deleteExerciseWithHistory(exercise.id);
      setRemoval(null);
      goBack({ pathname: '/programs', params: { view: 'exercises' } });
    } finally {
      setBusy(false);
    }
  };

  const transfer = async () => {
    if (!exercise || !transferTo || busy) return;
    setBusy(true);
    try {
      await transferExerciseHistory(exercise.id, transferTo.id, { deleteSource });
      const target = transferTo;
      setTransferTo(null);
      router.replace({ pathname: '/exercise/[id]', params: { id: target.id, notice: t('exerciseManage.transferred', { name: target.name }) } });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (!exercise) return <Screen><PageHeading title={t('details.exercise')} subtitle={t('library.empty')} /></Screen>;

  const cues = readList(exercise.cues);
  const equipment = readList(exercise.equipment);
  const muscles = readList(exercise.primaryMuscles);
  const extraCategories = readList(exercise.extraCategories).filter((item) => item !== exercise.category);
  const movementTags = exerciseMovementTags(exercise);
  const kind = exercise.level ? t('progression.level', { number: exercise.level }) : exercise.isCustom ? t('exercise.custom') : t('exercise.foundation');
  const scopeTitle = t('exerciseAnalytics.scope', { defaultValue: i18n.language.startsWith('it') ? 'Vista' : 'View' });
  const scopeLabels: Record<PairScope, string> = {
    average: t('exerciseAnalytics.average', { defaultValue: i18n.language.startsWith('it') ? 'Media L/R' : 'L/R average' }),
    left: t('exerciseAnalytics.left', { defaultValue: 'L' }),
    right: t('exerciseAnalytics.right', { defaultValue: 'R' }),
    legacy: t('exerciseAnalytics.legacy', { defaultValue: i18n.language.startsWith('it') ? 'Senza lato' : 'Without side' }),
  };
  const compareTitle = t('exerciseAnalytics.compareSides', { defaultValue: i18n.language.startsWith('it') ? 'Confronto L/R' : 'Compare L/R' });
  const compareBody = t('exerciseAnalytics.compareSidesBody', { defaultValue: i18n.language.startsWith('it') ? 'Confronta le due serie sulla stessa scala.' : 'Compare both sides on the same scale.' });
  return (
    <Screen>
      <PageHeading
        title={exercise.name}
        subtitle={[[exercise.category, ...extraCategories].map((category) => t(`library.category.${category}`)).join(' + '), t(`metric.${exercise.metric}`), kind].join(' · ')}
        action={
          <IconButton
            icon={exercise.favourite ? 'star' : 'star-outline'}
            label={exercise.favourite ? t('library.removeFavourite') : t('library.addFavourite')}
            onPress={() => void setExerciseFavourite(exercise.id, !exercise.favourite).then(reload)}
          />
        }
      />

      <ListGroup>
        <ListRow
          icon="layers-outline"
          title={t('movement.classification')}
          subtitle={`${t('movement.groupTitle')}: ${exercise.movementGroup ? t(`movement.groups.${exercise.movementGroup}`) : t('movement.none')} · ${t('exerciseGrouping.tagsTitle')}: ${movementTags.length ? movementTags.map((tag) => movementTagLabel(tag, t)).join(', ') : t('movement.none')}`}
          onPress={() => router.push({ pathname: '/exercise/new', params: { edit: exercise.id } })}
        />
        {exercise.demoUrl ? (
          <ListRow
            icon="play-circle"
            title={t('logger.referenceOpen')}
            subtitle={linkHost(exercise.demoUrl)}
            onPress={() => openReferenceVideo(exercise.demoUrl!)}
            trailing={<IconButton icon="create-outline" label={t('logger.reference')} tone="plain" size={36} onPress={() => setEditingReference(true)} />}
          />
        ) : (
          <ListRow icon="link" title={t('exercise.addReference')} subtitle={t('logger.referenceHint')} onPress={() => setEditingReference(true)} />
        )}
        {exercise.chainId ? (
          <ListRow icon="git-branch-outline" title={t('exercise.viewProgression')} onPress={() => router.push({ pathname: '/skill/[chainId]', params: { chainId: exercise.chainId! } })} />
        ) : null}
      </ListGroup>

      <View style={styles.section}>
        <SectionTitle title={scopeTitle} />
        <SegmentedControl<PairScope>
          value={pairScope}
          options={(Object.keys(scopeLabels) as PairScope[]).map((value) => ({ value, label: scopeLabels[value] }))}
          onChange={setPairScope}
        />
      </View>

      {cues.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle title={t('exercise.coaching')} />
          <View style={[styles.cues, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            {cues.map((cue) => (
              <View key={cue} style={styles.cue}>
                <Icon name="checkmark-circle-outline" size={18} color={palette.accentStrong} />
                <Body style={styles.cueText}>{cue}</Body>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {muscles.length > 0 || equipment.length > 0 ? (
        <View style={styles.tags}>
          {muscles.map((muscle) => <Tag key={`m-${muscle}`} icon="body-outline" label={muscle.replaceAll('-', ' ')} />)}
          {equipment.map((item) => <Tag key={`e-${item}`} icon="construct-outline" label={item.replaceAll('-', ' ')} />)}
        </View>
      ) : null}

      {cycle ? (
        <View style={styles.section}>
          <SectionTitle title={t('exerciseCycle.title')} />
          {cycle.current ? (
            <>
              <Body>{t('exerciseCycle.progress', {
                day: cycle.current.day,
                start: cycle.current.start.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' }),
                end: new Date(cycle.current.end.getTime() - 1).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' }),
              })}</Body>
              <View style={[styles.week, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                {cycle.current.seconds !== null ? <WeekStat value={formatMinutes(cycle.current.seconds)} label={t('mobilityStats.exerciseTime')} /> : null}
                <WeekStat value={String(cycle.current.sets)} label={t('mobilityStats.exerciseSets', { count: cycle.current.sets })} />
                <WeekStat value={String(cycle.current.sessions)} label={t('mobilityStats.exerciseSessions', { count: cycle.current.sessions })} />
              </View>
            </>
          ) : (
            <Body>{t('exerciseCycle.none')}</Body>
          )}
          {cycle.previous ? (
            <Body>{t('exerciseCycle.previous', {
              start: cycle.previous.start.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }),
              value: cycle.previous.seconds !== null ? formatMinutes(cycle.previous.seconds) : t('exerciseCycle.sets', { count: cycle.previous.sets }),
              count: cycle.previous.sessions,
            })}</Body>
          ) : null}
        </View>
      ) : null}

      {week ? (
        <View style={styles.section}>
          <SectionTitle title={t('mobilityStats.exerciseTitle')} />
          {week.sets === 0 ? (
            <Body>{t('mobilityStats.exerciseNone')}</Body>
          ) : (
            <View style={[styles.week, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <WeekStat value={String(week.sets)} label={t('mobilityStats.exerciseSets', { count: week.sets })} />
              <WeekStat value={String(week.sessions)} label={t('mobilityStats.exerciseSessions', { count: week.sessions })} />
              {week.seconds !== null ? <WeekStat value={formatMinutes(week.seconds)} label={t('mobilityStats.exerciseTime')} /> : null}
            </View>
          )}
        </View>
      ) : null}

      {records && exercise.metric !== 'distance' && records.bestAmount !== null ? (
        <View style={styles.section}>
          <SectionTitle title={t('records.title')} />
          <View style={[styles.week, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <WeekStat
              value={formatRecordValue(exercise.metric === 'time' || exercise.metric === 'time_load' ? 'holdAtLoad' : 'repsAtLoad', records.bestAmount, exercise.metric, t)}
              label={t('records.bestAmount')}
            />
            {records.bestE1rm !== null ? <WeekStat value={formatRecordValue('e1rm', records.bestE1rm, exercise.metric, t)} label={t('records.bestE1rm')} /> : null}
            {records.bestVolume !== null ? <WeekStat value={formatRecordValue('volume', records.bestVolume, exercise.metric, t)} label={t('records.bestVolume')} /> : null}
          </View>
          {records.repMaxes.length > 0 ? (
            <Body>{t('records.repMaxes')}: {records.repMaxes.map((item) => t('records.repMax', { reps: item.reps, load: formatNumber(item.loadKg) })).join(' · ')}</Body>
          ) : null}
        </View>
      ) : null}

      {exercise.metric === 'reps' || exercise.metric === 'reps_load' ? <RepsAtLoadCard key={exercise.id} groups={loadProgress} /> : null}

      {estimate ? (
        <View style={styles.section}>
          <SectionTitle title={t('estimate.title')} />
          {estimate.latest ? (
            <>
              <View style={[styles.week, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <WeekStat
                  value={formatEstimate(estimate.kind, estimate.latest.value)}
                  label={`${t('estimate.latest')} · ${t(estimate.kind === 'reps' ? 'estimate.sourceReps' : 'estimate.sourceHold', { done: estimate.kind === 'reps' ? estimate.latest.done : formatMinutes(estimate.latest.done), rpe: formatRpe(estimate.latest.rpe) })}`}
                />
                {estimate.recentBest ? <WeekStat value={formatEstimate(estimate.kind, estimate.recentBest.value)} label={t('estimate.recentBest')} /> : null}
              </View>
              <Body>{t('estimate.body')}</Body>
              <ListGroup>
                <ListRow
                  icon="stats-chart-outline"
                  title={t('estimate.seeTrend')}
                  onPress={() => router.push({ pathname: '/stats', params: { exerciseId: exercise.id, metric: estimate.kind === 'reps' ? 'estMaxReps' : 'estMaxHold', pairScope } })}
                />
              </ListGroup>
            </>
          ) : <Body>{t('estimate.hint')}</Body>}
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionTitle title={t('exerciseManage.history')} />
        {history.length > 0 ? (
          <View style={[styles.history, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            {history.slice(0, 5).map((session, index) => (
              <HistoryRow key={session.workoutId} session={session} metric={exercise.metric} locale={i18n.language} first={index === 0} />
            ))}
            {history.length > 5 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/exercise/history/[id]', params: { id: exercise.id } })}
                style={({ pressed }) => [styles.historyMore, { borderTopColor: palette.border, opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.historyMoreText, { color: palette.accentStrong }]}>{t('exerciseManage.allHistory', { count: history.length })}</Text>
                <Icon name="chevron-forward" size={16} color={palette.accentStrong} />
              </Pressable>
            ) : null}
          </View>
        ) : <Body>{t('exerciseManage.historyEmpty')}</Body>}
        {history.length > 0 ? (
          <ListGroup>
            <ListRow icon="analytics-outline" title={t('exerciseManage.fullAnalysis')} subtitle={t('exerciseManage.fullAnalysisBody')} onPress={() => router.push({ pathname: '/stats', params: { exerciseId: exercise.id, pairScope } })} />
            <ListRow icon="git-branch-outline" title={compareTitle} subtitle={compareBody} onPress={() => router.push({ pathname: '/stats', params: { exerciseId: exercise.id, pairScope: 'comparison' } })} />
          </ListGroup>
        ) : null}
      </View>

      <ActionButton icon="add" label={t('exercise.addToWorkout')} onPress={() => void beginWithExercise()} />
      <ActionButton icon="create-outline" label={t('exercise.edit')} secondary onPress={() => router.push({ pathname: '/exercise/new', params: { edit: exercise.id } })} />

      <View style={styles.section}>
        <SectionTitle title={t('exerciseManage.manage')} />
        <ListGroup>
          <ListRow icon="git-merge-outline" title={t('exerciseManage.transfer')} subtitle={t('exerciseManage.transferBody')} onPress={() => setTransferOpen(true)} />
          <ListRow icon="trash-outline" tint={palette.warning} title={t('exerciseManage.remove')} subtitle={t('exerciseManage.removeBody')} onPress={() => setRemoval('choose')} />
        </ListGroup>
      </View>

      {editingReference ? (
        <ReferenceLinkSheet
          visible
          exerciseId={exercise.id}
          exerciseName={exercise.name}
          currentUrl={exercise.demoUrl}
          onClose={() => setEditingReference(false)}
          onSaved={() => { setEditingReference(false); void reload(); }}
        />
      ) : null}

      <Sheet
        visible={removal === 'choose'}
        onClose={() => setRemoval(null)}
        title={t('exerciseManage.removeTitle', { name: exercise.name })}
        body={usage && usage.sets > 0 ? t('exerciseManage.removeUsage', { count: usage.sets, workouts: usage.workouts }) : t('exerciseManage.removeUnused')}
      >
        {usage && usage.sets > 0 ? (
          <>
            <ActionButton icon="eye-off-outline" label={t('exerciseManage.hide')} secondary onPress={() => void hide()} />
            <Body style={styles.choiceHint}>{t('exerciseManage.hideBody')}</Body>
            <ActionButton icon="trash-outline" label={t('exerciseManage.deleteAll')} variant="danger" onPress={() => setRemoval('delete')} />
          </>
        ) : (
          <ActionButton icon="trash-outline" label={t('exerciseManage.deleteNow')} variant="danger" onPress={() => void deleteAll()} />
        )}
        <ActionButton label={t('common.cancel')} variant="ghost" onPress={() => setRemoval(null)} />
      </Sheet>

      <Sheet visible={removal === 'delete'} onClose={() => setRemoval(null)} title={t('exerciseManage.deleteTitle', { name: exercise.name })} body={t('exerciseManage.deleteBody')}>
        <ActionButton icon="trash-outline" label={t('exerciseManage.deleteConfirm')} variant="danger" disabled={busy} onPress={() => void deleteAll()} />
        <ActionButton label={t('common.cancel')} secondary onPress={() => setRemoval(null)} />
      </Sheet>

      <ExercisePicker
        visible={transferOpen}
        title={t('exerciseManage.transferPick')}
        subtitle={t('exerciseManage.transferPickBody')}
        include={(choice) => choice.id !== exercise.id && canTransfer(exercise.metric, choice.metric)}
        onChoose={(choice) => { setTransferOpen(false); setDeleteSource(true); setTransferTo(choice); }}
        onClose={() => setTransferOpen(false)}
      />

      {transferTo ? (
        <Sheet
          visible
          onClose={() => setTransferTo(null)}
          title={t('exerciseManage.transferTitle')}
          body={usage && usage.sets > 0
            ? t('exerciseManage.transferSummary', { count: usage.sets, workouts: usage.workouts, from: exercise.name, to: transferTo.name })
            : t('exerciseManage.transferNothing', { from: exercise.name, to: transferTo.name })}
        >
          <View style={[styles.transferPair, { backgroundColor: palette.surfaceMuted }]}>
            <Text numberOfLines={2} style={[styles.transferName, { color: palette.textMuted }]}>{exercise.name}</Text>
            <Icon name="arrow-forward" size={18} color={palette.accentStrong} />
            <Text numberOfLines={2} style={[styles.transferName, { color: palette.text }]}>{transferTo.name}</Text>
          </View>
          {metricAfterTransfer(transferTo.metric, Boolean(usage?.hasLoad) || exercise.metric.endsWith('_load')) !== transferTo.metric ? (
            <View style={styles.transferNote}>
              <Icon name="barbell-outline" size={16} color={palette.accentStrong} />
              <Body style={styles.flex}>{t('exerciseManage.transferLoad', { to: transferTo.name })}</Body>
            </View>
          ) : null}
          <SwitchRow icon="trash-outline" title={t('exerciseManage.deleteSource', { name: exercise.name })} subtitle={t('exerciseManage.deleteSourceBody')} value={deleteSource} onChange={setDeleteSource} />
          <ActionButton icon="git-merge-outline" label={t('exerciseManage.transferConfirm')} disabled={busy} onPress={() => void transfer()} />
          <ActionButton label={t('common.cancel')} secondary onPress={() => setTransferTo(null)} />
        </Sheet>
      ) : null}

      <Toast message={toast} onHide={() => setToast(null)} />
    </Screen>
  );
}

function formatEstimate(kind: ExerciseEstimate['kind'], value: number): string {
  return kind === 'reps' ? `${formatNumber(Math.round(value * 2) / 2)} reps` : formatMinutes(value);
}

function WeekStat({ value, label }: { value: string; label: string }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <View style={styles.weekItem}>
      <Text style={[styles.weekValue, { color: palette.text }]}>{value}</Text>
      <Text style={[styles.weekLabel, { color: palette.textMuted }]}>{label}</Text>
    </View>
  );
}

function Tag({ label, icon }: { label: string; icon: 'body-outline' | 'construct-outline' }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: palette.surfaceMuted }]}>
      <Icon name={icon} size={13} color={palette.textMuted} />
      <Text style={[styles.tagText, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  section: { gap: 10 },
  flex: { flex: 1 },
  history: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  historyMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 48, borderTopWidth: StyleSheet.hairlineWidth },
  historyMoreText: { fontFamily: fonts.semibold, fontSize: 14 },
  choiceHint: { marginTop: -4, marginBottom: 4 },
  transferPair: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 },
  transferName: { flex: 1, fontFamily: fonts.semibold, fontSize: 16 },
  transferNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  week: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, paddingVertical: 18 },
  weekItem: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 6 },
  weekValue: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, fontVariant: ['tabular-nums'] },
  weekLabel: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  cues: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8 },
  cue: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 9 },
  cueText: { flex: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, minHeight: 30, borderRadius: 999 },
  tagText: { fontFamily: fonts.medium, fontSize: 13, textTransform: 'capitalize' },
});
