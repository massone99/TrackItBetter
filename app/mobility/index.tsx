import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { estimateRoutineSeconds } from '../../src/domain/mobilityPlan';
import { daysSinceRun, recommendRoutine } from '../../src/domain/mobilityRecommend';
import { GOAL_PRESETS_MIN, readWeeklyGoalMin, writeWeeklyGoalMin } from '../../src/features/mobility/goal';
import { deleteMobilityRoutine, duplicateMobilityRoutine, listMobilityRoutines, setMobilityFavourite, type MobilityRoutine } from '../../src/features/mobility/routines';
import { getMobilityCycles, getMobilityWeek } from '../../src/features/analytics/repository';
import type { ExerciseCycle, MobilityWeek } from '../../src/features/analytics/mobility';
import { formatMinutes } from '../../src/shared/utils/format';
import { ActionButton, Chip, EmptyState, Icon, IconButton, ListGroup, ListRow, PageHeading, Screen, SectionTitle, Sheet, Text } from '../../src/shared/components/ui';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { fonts } from '../../src/shared/theme/typography';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';

export default function MobilityHubScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [routines, setRoutines] = useState<MobilityRoutine[] | null>(null);
  const [week, setWeek] = useState<MobilityWeek | null>(null);
  const [cycles, setCycles] = useState<ExerciseCycle[]>([]);
  const [filter, setFilter] = useState<'all' | 'favourites'>('all');
  const [menuFor, setMenuFor] = useState<MobilityRoutine | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MobilityRoutine | null>(null);
  const [failed, setFailed] = useState(false);
  const [goalMin, setGoalMin] = useState(readWeeklyGoalMin);
  const [goalOpen, setGoalOpen] = useState(false);
  const recommended = useMemo(() => recommendRoutine(routines ?? [], new Date()), [routines]);
  const reload = useCallback(() => listMobilityRoutines().then(setRoutines), []);
  const shown = useMemo(() => (routines ?? []).filter((routine) => filter === 'all' || routine.favourite), [routines, filter]);
  const lastRun = (routine: MobilityRoutine) => {
    const days = daysSinceRun(routine, new Date());
    return days === null ? t('mobilityHub.neverDone') : days === 0 ? t('mobilityHub.lastDoneToday') : t('mobilityHub.lastDone', { count: days });
  };
  const run = (action: () => Promise<unknown>) => {
    setMenuFor(null);
    setFailed(false);
    void action().then(reload).catch(() => setFailed(true));
  };

  useFocusEffect(useCallback(() => {
    let mounted = true;
    void listMobilityRoutines().then((items) => { if (mounted) setRoutines(items); });
    void getMobilityWeek().then((summary) => { if (mounted) setWeek(summary); }).catch(() => undefined);
    void getMobilityCycles().then((items) => { if (mounted) setCycles(items); }).catch(() => undefined);
    return () => { mounted = false; };
  }, []));

  return (
    <Screen>
      <PageHeading
        title={t('mobility.title')}
        subtitle={t('mobility.subtitle')}
      />

      {recommended ? (
        <View style={[styles.suggested, { backgroundColor: palette.hero }]}>
          <View style={styles.suggestedCopy}>
            <Text style={[styles.suggestedLabel, { color: palette.heroTextMuted }]}>{t('mobilityHub.recommended')}</Text>
            <Text style={[styles.suggestedName, { color: palette.heroText }]}>{recommended.name}</Text>
            <Text style={[styles.suggestedMeta, { color: palette.heroTextMuted }]}>
              {t('mobility.minutes', { count: Math.max(1, Math.round(estimateRoutineSeconds(recommended) / 60)) })} · {lastRun(recommended)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('mobility.start')} ${recommended.name}`}
            onPress={() => router.push({ pathname: '/mobility/play/[id]', params: { id: recommended.id } })}
            style={({ pressed }) => [styles.suggestedPlay, { backgroundColor: palette.heroText, opacity: pressed ? 0.8 : 1 }]}
          >
            <Icon name="play" size={24} color={palette.hero} />
          </Pressable>
        </View>
      ) : null}

      <SectionTitle title={t('mobilityHub.create')} />
      <View style={styles.createRow}>
        <CreateTile icon="add" label={t('mobilityHub.createNew')} primary onPress={() => router.push({ pathname: '/mobility/routine/[id]', params: { id: 'new' } })} />
        <CreateTile icon="download-outline" label={t('mobilityHub.fromWorkout')} onPress={() => router.push({ pathname: '/mobility/import', params: { mode: 'workout' } })} />
        <CreateTile icon="swap-horizontal" label={t('mobilityHub.convertProgram')} onPress={() => router.push({ pathname: '/mobility/import', params: { mode: 'program' } })} />
      </View>

      {week ? (
        <View style={[styles.week, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.weekItem}>
            <Text style={styles.weekValue}>{formatMinutes(week.seconds)}</Text>
            <Text style={[styles.weekLabel, { color: palette.textMuted }]}>{t('mobilityStats.hubTime')}</Text>
          </View>
          <View style={[styles.weekDivider, { backgroundColor: palette.border }]} />
          <View style={styles.weekItem}>
            <Text style={styles.weekValue}>{week.sessions}</Text>
            <Text style={[styles.weekLabel, { color: palette.textMuted }]}>{t('mobilityStats.hubSessions', { count: week.sessions })}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('mobilityHub.goalTitle')}
            onPress={() => setGoalOpen(true)}
            style={styles.goal}
          >
            {goalMin > 0 ? (
              <>
                <View style={[styles.goalTrack, { backgroundColor: palette.surfaceMuted }]}>
                  <View style={[styles.goalFill, { backgroundColor: palette.accent, width: `${Math.min(100, Math.round((week.seconds / 60 / goalMin) * 100))}%` }]} />
                </View>
                <Text style={[styles.routineMeta, { color: palette.textMuted }]}>
                  {week.seconds / 60 >= goalMin ? t('mobilityHub.goalReached') : t('mobilityHub.goalProgress', { done: Math.floor(week.seconds / 60), goal: goalMin })}
                </Text>
              </>
            ) : <Text style={[styles.goalSet, { color: palette.accentStrong }]}>{t('mobilityHub.goalSet')}</Text>}
          </Pressable>
        </View>
      ) : null}

      {cycles.length > 0 ? (
        <>
          <SectionTitle title={t('exerciseCycle.hubTitle')} />
          <ListGroup>
            {cycles.map((cycle) => (
              <ListRow
                key={cycle.exerciseId}
                icon={cycle.seconds !== null ? 'timer-outline' : 'repeat'}
                title={cycle.exerciseName}
                subtitle={[
                  cycle.seconds !== null ? formatMinutes(cycle.seconds) : t('exerciseCycle.sets', { count: cycle.sets }),
                  t('mobilityStats.sessionsCount', { count: cycle.sessions }),
                  t('exerciseCycle.dayOf', { day: cycle.day, start: cycle.start.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' }) }),
                ].join(' · ')}
                onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: cycle.exerciseId } })}
              />
            ))}
          </ListGroup>
        </>
      ) : null}

      <SectionTitle title={t('mobility.routines')} />
      {routines && routines.length === 0 ? (
        <EmptyState
          icon="body-outline"
          title={t('mobility.emptyTitle')}
          body={t('mobility.emptyBody')}
          action={<View style={styles.emptyAction}><ActionButton icon="add" label={t('mobility.newRoutine')} onPress={() => router.push({ pathname: '/mobility/routine/[id]', params: { id: 'new' } })} /></View>}
        />
      ) : null}
      {routines && routines.length > 0 ? (
        <View style={styles.chips}>
          <Chip label={t('mobilityHub.filterAll')} selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip icon="star-outline" label={t('mobilityHub.filterFavourites')} selected={filter === 'favourites'} onPress={() => setFilter('favourites')} />
        </View>
      ) : null}
      {routines && routines.length > 0 && shown.length === 0 ? <Text style={[styles.routineMeta, { color: palette.textMuted }]}>{t('mobilityHub.noFavourites')}</Text> : null}
      {failed ? <Text style={[styles.routineMeta, { color: palette.warning }]}>{t('mobility.invalid')}</Text> : null}
      {shown.map((routine) => {
        const minutes = Math.max(1, Math.round(estimateRoutineSeconds(routine) / 60));
        return (
          <View key={routine.id} style={[styles.routine, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.routineHead}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('mobility.edit')} ${routine.name}`}
                onPress={() => router.push({ pathname: '/mobility/routine/[id]', params: { id: routine.id } })}
                style={styles.routineCopy}
              >
                <View style={styles.nameRow}>
                  <Text style={styles.routineName}>{routine.name}</Text>
                  {routine.favourite ? <Icon name="star" size={18} color={palette.record} /> : null}
                </View>
                <Text style={[styles.routineMeta, { color: palette.textMuted }]}>
                  {t('mobility.drills', { count: routine.steps.length })} · {t('mobility.minutes', { count: minutes })}
                </Text>
              </Pressable>
              <IconButton icon="ellipsis-vertical" tone="plain" label={t('mobilityHub.more', { name: routine.name })} onPress={() => setMenuFor(routine)} />
            </View>
            <View style={styles.startRow}>
              <View style={styles.flex}><ActionButton icon="play" label={t('mobilityHub.startSilent')} onPress={() => router.push({ pathname: '/mobility/play/[id]', params: { id: routine.id, voice: '0' } })} /></View>
              <View style={styles.flex}><ActionButton icon="mic-outline" secondary label={t('mobilityHub.startNarrated')} onPress={() => router.push({ pathname: '/mobility/play/[id]', params: { id: routine.id, voice: '1' } })} /></View>
            </View>
          </View>
        );
      })}

      <SectionTitle title={t('mobility.tests')} />
      <ListGroup>
        <ListRow icon="analytics-outline" title={t('mobility.tests')} subtitle={t('mobility.testsBody')} onPress={() => router.push('/mobility/tests')} />
        {Platform.OS === 'web' ? null : (
          <ListRow icon="scan-outline" title={t('mobility.poseTitle')} subtitle={t('mobility.poseBody')} onPress={() => router.push('/pose')} />
        )}
      </ListGroup>

      <Sheet visible={goalOpen} onClose={() => setGoalOpen(false)} title={t('mobilityHub.goalTitle')} body={`${t('mobilityHub.goalSheetBody')} ${t('mobilityHub.goalHint')}`}>
        <View style={styles.chips}>
          {GOAL_PRESETS_MIN.map((minutes) => (
            <Chip key={minutes} label={t('mobility.minutes', { count: minutes })} selected={goalMin === minutes} onPress={() => { setGoalMin(minutes); writeWeeklyGoalMin(minutes); setGoalOpen(false); }} />
          ))}
          <Chip label={t('mobilityHub.goalOff')} selected={goalMin === 0} onPress={() => { setGoalMin(0); writeWeeklyGoalMin(0); setGoalOpen(false); }} />
        </View>
      </Sheet>
      <Sheet visible={menuFor !== null} onClose={() => setMenuFor(null)} title={menuFor?.name ?? ''}>
        {menuFor ? (
          <>
            <ActionButton icon="create-outline" secondary label={t('mobilityHub.edit')} onPress={() => { const id = menuFor.id; setMenuFor(null); router.push({ pathname: '/mobility/routine/[id]', params: { id } }); }} />
            <ActionButton icon="copy-outline" secondary label={t('mobilityHub.duplicate')} onPress={() => run(() => duplicateMobilityRoutine(menuFor.id, t('mobilityHub.copyName', { name: menuFor.name }).slice(0, 60)))} />
            <ActionButton icon={menuFor.favourite ? 'star' : 'star-outline'} secondary label={menuFor.favourite ? t('mobilityHub.unfavourite') : t('mobilityHub.favourite')} onPress={() => run(() => setMobilityFavourite(menuFor.id, !menuFor.favourite))} />
            <ActionButton icon="trash-outline" variant="danger" label={t('mobility.delete')} onPress={() => { setConfirmDelete(menuFor); setMenuFor(null); }} />
          </>
        ) : null}
      </Sheet>
      <Sheet visible={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title={t('mobility.delete')} body={t('mobility.deleteBody')}>
        <ActionButton icon="trash-outline" label={t('logger.confirmRemove')} variant="danger" onPress={() => { const target = confirmDelete; setConfirmDelete(null); if (target) run(() => deleteMobilityRoutine(target.id)); }} />
        <ActionButton label={t('common.cancel')} secondary onPress={() => setConfirmDelete(null)} />
      </Sheet>
    </Screen>
  );
}

function CreateTile({ icon, label, primary = false, onPress }: { icon: ComponentProps<typeof Icon>['name']; label: string; primary?: boolean; onPress: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { backgroundColor: primary ? palette.accent : palette.surface, borderColor: primary ? palette.accent : palette.border, opacity: pressed ? 0.8 : 1 }]}
    >
      <Icon name={icon} size={22} color={primary ? palette.accentText : palette.accentStrong} />
      <Text style={[styles.tileLabel, { color: primary ? palette.accentText : palette.text }]}>{label}</Text>
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  emptyAction: { alignSelf: 'stretch', marginTop: 6 },
  week: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 16, borderWidth: 1, paddingVertical: 18 },
  weekItem: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 8 },
  weekValue: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, fontVariant: ['tabular-nums'] },
  weekLabel: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  weekDivider: { width: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
  suggested: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, paddingVertical: 16, paddingLeft: 20, paddingRight: 16 },
  suggestedCopy: { flex: 1, gap: 2 },
  suggestedLabel: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase' },
  suggestedName: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32 },
  suggestedMeta: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  suggestedPlay: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  goal: { flexBasis: '100%', minHeight: 48, justifyContent: 'center', gap: 6, paddingHorizontal: 16 },
  goalTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  goalFill: { height: '100%', borderRadius: 4 },
  goalSet: { fontFamily: fonts.semibold, fontSize: 15 },
  createRow: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, minHeight: 88, borderRadius: 16, borderWidth: 1, padding: 12, justifyContent: 'space-between', gap: 8 },
  tileLabel: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  routine: { gap: 12, borderRadius: 16, borderWidth: 1, paddingLeft: 16, paddingRight: 8, paddingVertical: 12 },
  routineHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  startRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  routineCopy: { flex: 1, gap: 3, paddingVertical: 4 },
  routineName: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28 },
  routineMeta: { fontFamily: fonts.body, fontSize: 14 },
});
