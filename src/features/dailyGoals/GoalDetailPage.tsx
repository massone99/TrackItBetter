import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { goalMatches, type DailyGoalProgress, type GoalPeriod } from '../../domain/dailyGoals';
import { rowCategories } from '../analytics/summary';
import { goalsOf } from './repository';
import { DailyGoalSheet, type GoalDraft } from './DailyGoalSheet';
import { useGoalText } from './DailyGoalViews';
import { useGoalT } from './period';
import { goalAmount } from './labels';
import { listExercises } from '../exercises/repository';
import { exerciseMovementTags } from '../exercises/movementCatalog';
import { openExercisePage } from '../exercises/openExercise';
import { startMicroSession } from '../session/microSession';
import { WorkoutInProgressSheet } from '../session/WorkoutInProgressSheet';
import { Body, Chip, EmptyState, FooterAction, IconButton, Label, ListGroup, ListRow, PageHeading, ProgressMeter, Screen, SectionTitle, Text } from '../../shared/components/ui';
import { ShowMore, usePaged } from '../../shared/components/paging';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { fonts } from '../../shared/theme/typography';

type Choice = { id: string; name: string };

/** One goal of the day or the week: the total so far, where it came from, and the exercises that count toward it. */
export function GoalDetailPage({ period }: { period: GoalPeriod }) {
  const store = goalsOf(period);
  const tg = useGoalT(period);
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const goalText = useGoalText();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [progress, setProgress] = useState<DailyGoalProgress | null | undefined>(undefined);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [blockedBy, setBlockedBy] = useState<{ id: string; name: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void Promise.all([store.snapshot(), listExercises()]).then(([snapshot, all]) => {
      const found = snapshot.progress.find((item) => item.goal.id === id) ?? null;
      setProgress(found);
      if (!found) return;
      // Exercises used today for this goal first, then favourites, then the rest by name.
      const usedToday = new Set(found.contributions.map((item) => item.exerciseId));
      const matching = all.filter((exercise) => goalMatches(found.goal, {
        categories: rowCategories(exercise), group: exercise.movementGroup, tags: exerciseMovementTags(exercise),
      }));
      matching.sort((a, b) => Number(usedToday.has(b.id)) - Number(usedToday.has(a.id)) || Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name));
      setChoices(matching.map((exercise) => ({ id: exercise.id, name: exercise.name })));
    }, () => setError(t('common.loadError')));
  }, [id, t, store]);
  useFocusEffect(load);

  const save = async (draft: GoalDraft) => {
    setEditing(false);
    try { await store.put(draft); } catch { setError(t('dailyGoals.saveError')); }
    load();
  };
  const start = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const result = await startMicroSession(picked);
      if ('active' in result) { setBlockedBy(result.active); return; }
      router.push({ pathname: '/workout/[id]', params: { id: result.workoutId } });
    } catch (reason) {
      setError(`${t('micro.error')} (${reason instanceof Error ? reason.message : String(reason)})`);
    } finally {
      setStarting(false);
    }
  };
  const page = usePaged(choices, 12, id);
  const toggle = (exerciseId: string) => setPicked((current) => (current.includes(exerciseId) ? current.filter((item) => item !== exerciseId) : [...current, exerciseId]));

  if (progress === undefined) return <Screen><PageHeading title={tg('title')} /><ActivityIndicator color={palette.accent} /></Screen>;
  if (progress === null) {
    return <Screen><PageHeading title={tg('title')} /><EmptyState icon="flag-outline" title={t('dailyGoals.notFound')} body={t('dailyGoals.emptyBody')} /></Screen>;
  }

  const { goal } = progress;
  const text = goalText(progress);
  const unit = goal.measure === 'reps' ? ` ${t('dailyGoals.repsUnit')}` : '';
  return (
    <Screen
      footer={<FooterAction icon="flash-outline" label={starting ? t('programBuilder.starting') : picked.length === 0 ? t('dailyGoals.miniSession') : t('dailyGoals.startFor', { count: picked.length })} disabled={starting} onPress={() => (picked.length === 0 ? router.push('/micro-session') : void start())} />}
    >
      <WorkoutInProgressSheet active={blockedBy} onClose={() => setBlockedBy(null)} />
      <PageHeading
        title={text.name}
        subtitle={text.kind}
        action={<IconButton icon="create-outline" label={t('dailyGoals.editTitle')} onPress={() => setEditing(true)} />}
      />
      {error ? <Body style={{ color: palette.warning }}>{error}</Body> : null}
      <View style={styles.total}>
        <View style={styles.totalRow}>
          <Text style={[styles.done, { color: progress.reached ? palette.success : palette.text }]}>{goalAmount(goal.measure, progress.done)}</Text>
          <Text style={[styles.of, { color: palette.textMuted }]}>{t('dailyGoals.of', { amount: `${goalAmount(goal.measure, goal.target)}${unit}` })}</Text>
          <Text style={[styles.status, { color: progress.reached ? palette.success : palette.accentStrong }]}>
            {progress.reached
              ? progress.done > goal.target ? t('dailyGoals.reachedOver', { amount: `${goalAmount(goal.measure, progress.done - goal.target)}${unit}` }) : t('dailyGoals.reachedShort')
              : text.remaining}
          </Text>
        </View>
        <ProgressMeter value={progress.done} total={goal.target} label={text.amount} tone={progress.reached ? 'success' : 'accent'} />
      </View>

      <SectionTitle title={t('dailyGoals.fromWhere')} />
      {progress.contributions.length === 0 ? (
        <Body>{tg(goal.measure === 'minutes' ? 'nothingMinutes' : 'nothingReps')}</Body>
      ) : (
        <ListGroup>
          {progress.contributions.map((item) => (
            <ListRow
              key={`${item.workoutId}:${item.exerciseId}`}
              title={`${item.exerciseName} · ${goalAmount(goal.measure, item.amount)}${unit}`}
              subtitle={`${period === 'week' ? `${item.at.toLocaleDateString(i18n.language, { weekday: 'short' })} ` : ''}${item.at.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })} · ${item.workoutName} · ${t('dailyGoals.sets', { count: item.sets })}`}
              onPress={() => openExercisePage(item.exerciseId)}
            />
          ))}
        </ListGroup>
      )}

      <SectionTitle title={t('dailyGoals.exercisesTitle')} />
      {choices.length === 0 ? <Body>{t('dailyGoals.noExercises')}</Body> : (
        <View style={styles.group}>
          <Label>{t('dailyGoals.pickHint')}</Label>
          <View style={styles.chips}>
            {page.shown.map((choice) => <Chip key={choice.id} label={choice.name} selected={picked.includes(choice.id)} icon={picked.includes(choice.id) ? 'checkmark' : undefined} onPress={() => toggle(choice.id)} />)}
          </View>
          <ShowMore remaining={page.remaining} onPress={page.more} />
        </View>
      )}
      <DailyGoalSheet period={period} key={editing ? `edit-${goal.id}` : 'closed'} visible={editing} initial={goal} onSave={(draft) => void save(draft)} onClose={() => setEditing(false)} />
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  total: { gap: 8 },
  totalRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 },
  done: { fontFamily: fonts.display, fontSize: 36 },
  of: { fontSize: 16 },
  status: { flexGrow: 1, textAlign: 'right', fontSize: 14, fontFamily: fonts.semibold },
  group: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
