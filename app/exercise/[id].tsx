import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { Exercise } from '../../src/db/schema';
import { openReferenceVideo, ReferenceLinkSheet } from '../../src/features/exercises/ReferenceLinkSheet';
import { movementTagLabel } from '../../src/features/exercises/ClassificationChoices';
import { archiveCustomExercise, getExerciseById, setExerciseFavourite } from '../../src/features/exercises/repository';
import { addExerciseToWorkout, getActiveWorkout, startWorkout } from '../../src/features/session/repository';
import { getExerciseCycle, getExerciseEstimate, getExerciseWeekStats } from '../../src/features/analytics/repository';
import type { ExerciseEstimate } from '../../src/features/analytics/estimates';
import type { ExerciseCycle, ExerciseWeek } from '../../src/features/analytics/mobility';
import { formatMinutes, formatNumber } from '../../src/shared/utils/format';
import { formatRpe } from '../../src/domain';
import { ActionButton, Body, Icon, IconButton, ListGroup, ListRow, PageHeading, Screen, SectionTitle, Sheet, Text } from '../../src/shared/components/ui';
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

export default function ExerciseRoute() {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState<ExerciseWeek | null>(null);
  const [cycle, setCycle] = useState<{ current: ExerciseCycle | null; previous: ExerciseCycle | null } | null>(null);
  const [estimate, setEstimate] = useState<ExerciseEstimate | null>(null);
  const [editingReference, setEditingReference] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const reload = useCallback(async () => {
    const found = await getExerciseById(id);
    setExercise(found);
    setLoading(false);
    // Mobility and stretching count their own week from the first day trained; the rest the last 7 days.
    if (found && [found.category, ...readList(found.extraCategories)].includes('mobility')) setCycle(await getExerciseCycle(found.id).catch(() => null));
    else if (found) setWeek(await getExerciseWeekStats(found.id, found.metric).catch(() => null));
    if (found) setEstimate(await getExerciseEstimate(found.id).catch(() => null));
  }, [id]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const beginWithExercise = async () => {
    if (!exercise) return;
    const active = await getActiveWorkout();
    const workoutId = active?.id ?? await startWorkout();
    await addExerciseToWorkout(workoutId, exercise.id);
    router.push({ pathname: '/workout/[id]', params: { id: workoutId } });
  };

  const archive = async () => {
    if (!exercise) return;
    setConfirmArchive(false);
    await archiveCustomExercise(exercise.id);
    goBack({ pathname: '/programs', params: { view: 'exercises' } });
  };

  if (loading) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (!exercise) return <Screen><PageHeading title={t('details.exercise')} subtitle={t('library.empty')} /></Screen>;

  const cues = readList(exercise.cues);
  const equipment = readList(exercise.equipment);
  const muscles = readList(exercise.primaryMuscles);
  const extraCategories = readList(exercise.extraCategories).filter((item) => item !== exercise.category);
  const kind = exercise.level ? t('progression.level', { number: exercise.level }) : exercise.isCustom ? t('exercise.custom') : t('exercise.foundation');
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
          subtitle={`${t('movement.groupTitle')}: ${exercise.movementGroup ? t(`movement.groups.${exercise.movementGroup}`) : t('movement.none')} · ${t('movement.tagTitle')}: ${exercise.movementTag ? movementTagLabel(exercise.movementTag, t) : t('movement.none')}`}
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
                  onPress={() => router.push({ pathname: '/stats', params: { exerciseId: exercise.id, metric: estimate.kind === 'reps' ? 'estMaxReps' : 'estMaxHold' } })}
                />
              </ListGroup>
            </>
          ) : <Body>{t('estimate.hint')}</Body>}
        </View>
      ) : null}

      <ActionButton icon="add" label={t('exercise.addToWorkout')} onPress={() => void beginWithExercise()} />
      <ActionButton icon="create-outline" label={t('exercise.edit')} secondary onPress={() => router.push({ pathname: '/exercise/new', params: { edit: exercise.id } })} />
      {exercise.isCustom ? (
        <ActionButton icon="archive-outline" label={t('exercise.removeFromLibrary')} variant="danger" onPress={() => setConfirmArchive(true)} />
      ) : null}

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

      <Sheet visible={confirmArchive} onClose={() => setConfirmArchive(false)} title={t('exercise.removeFromLibrary')} body={t('exercise.removeFromLibraryBody')}>
        <ActionButton icon="archive-outline" label={t('logger.confirmRemove')} variant="danger" onPress={() => void archive()} />
        <ActionButton label={t('common.cancel')} secondary onPress={() => setConfirmArchive(false)} />
      </Sheet>
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
  week: { flexDirection: 'row', borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 14 },
  weekItem: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 6 },
  weekValue: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30 },
  weekLabel: { fontFamily: fonts.body, fontSize: 13, textAlign: 'center' },
  cues: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 6 },
  cue: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 9 },
  cueText: { flex: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, height: 30, borderRadius: 999 },
  tagText: { fontFamily: fonts.medium, fontSize: 13, textTransform: 'capitalize' },
});
