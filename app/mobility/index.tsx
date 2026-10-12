import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { estimateRoutineSeconds } from '../../src/domain/mobilityPlan';
import { groupRoutinesByProgram, type GroupProgram } from '../../src/domain/mobilityGroups';
import { daysSinceRun, recommendRoutine } from '../../src/domain/mobilityRecommend';
import { GOAL_PRESETS_MIN, readWeeklyGoalMin, writeWeeklyGoalMin } from '../../src/features/mobility/goal';
import { deleteMobilityRoutine, duplicateMobilityRoutine, listMobilityRoutines, moveMobilityRoutine, setMobilityFavourite, type MobilityRoutine } from '../../src/features/mobility/routines';
import { programTemplates } from '../../src/features/programs/catalog';
import { listUserPrograms } from '../../src/features/programs/userPrograms';
import { getMobilityCycles, getMobilityWeek } from '../../src/features/analytics/repository';
import type { ExerciseCycle, MobilityWeek } from '../../src/features/analytics/mobility';
import { readPreference, writePreference } from '../../src/shared/settings/preferences';
import { formatMinutes } from '../../src/shared/utils/format';
import { ActionButton, Chip, EmptyState, Icon, IconButton, ListGroup, ListRow, PageHeading, Screen, SectionTitle, Sheet, Text } from '../../src/shared/components/ui';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { fonts } from '../../src/shared/theme/typography';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';

const COLLAPSED_KEY = 'mobility.collapsedGroups';
const CYCLES_OPEN_KEY = 'mobility.cyclesOpen';
const NO_PROGRAM = 'none';

function readCollapsed(): string[] {
  try {
    const parsed: unknown = JSON.parse(readPreference(COLLAPSED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

interface ProgramChoice { id: string; name: string; own: boolean }

export default function MobilityHubScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const lang = i18n.language.toLowerCase().startsWith('it') ? 'it' : 'en';
  const [routines, setRoutines] = useState<MobilityRoutine[] | null>(null);
  const [programs, setPrograms] = useState<ProgramChoice[]>([]);
  const [groupPrograms, setGroupPrograms] = useState<GroupProgram[]>([]);
  const [week, setWeek] = useState<MobilityWeek | null>(null);
  const [cycles, setCycles] = useState<ExerciseCycle[]>([]);
  const [filter, setFilter] = useState<'all' | 'favourites'>('all');
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed);
  const [cyclesOpen, setCyclesOpen] = useState(() => readPreference(CYCLES_OPEN_KEY) === 'true');
  const [menuFor, setMenuFor] = useState<MobilityRoutine | null>(null);
  const [moveFor, setMoveFor] = useState<MobilityRoutine | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MobilityRoutine | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [goalMin, setGoalMin] = useState(readWeeklyGoalMin);
  const [goalOpen, setGoalOpen] = useState(false);
  const recommended = useMemo(() => recommendRoutine(routines ?? [], new Date()), [routines]);
  const reload = useCallback(() => listMobilityRoutines().then(setRoutines), []);
  const shown = useMemo(() => (routines ?? []).filter((routine) => filter === 'all' || routine.favourite), [routines, filter]);
  const groups = useMemo(() => groupRoutinesByProgram(shown, groupPrograms), [shown, groupPrograms]);
  const lastRun = (routine: MobilityRoutine) => {
    const days = daysSinceRun(routine, new Date());
    return days === null ? t('mobilityHub.neverDone') : days === 0 ? t('mobilityHub.lastDoneToday') : t('mobilityHub.lastDone', { count: days });
  };
  const minutesOf = (routine: MobilityRoutine) => Math.max(1, Math.round(estimateRoutineSeconds(routine) / 60));
  const run = (action: () => Promise<unknown>) => {
    setMenuFor(null);
    setMoveFor(null);
    setFailed(false);
    void action().then(reload).catch(() => setFailed(true));
  };
  const toggleGroup = (key: string) => {
    const next = collapsed.includes(key) ? collapsed.filter((item) => item !== key) : [...collapsed, key];
    setCollapsed(next);
    writePreference(COLLAPSED_KEY, JSON.stringify(next));
  };
  const keys = groups.map((group) => group.programId ?? NO_PROGRAM);
  const allCollapsed = keys.length > 0 && keys.every((key) => collapsed.includes(key));
  const toggleAll = () => {
    const next = allCollapsed ? [] : keys;
    setCollapsed(next);
    writePreference(COLLAPSED_KEY, JSON.stringify(next));
  };
  const play = (routine: MobilityRoutine, voice?: boolean) => router.push({ pathname: '/mobility/play/[id]', params: voice === undefined ? { id: routine.id } : { id: routine.id, voice: voice ? '1' : '0' } });

  useFocusEffect(useCallback(() => {
    let mounted = true;
    void listMobilityRoutines().then((items) => { if (mounted) setRoutines(items); });
    void listUserPrograms().then((own) => {
      if (!mounted) return;
      const choices: ProgramChoice[] = [
        ...own.map((program) => ({ id: program.id, name: program.name, own: true })),
        ...programTemplates.map((program) => ({ id: program.id, name: program.name[lang], own: false })),
      ];
      setPrograms(choices);
      setGroupPrograms([
        ...own.map((program) => ({ id: program.id, name: program.name, workoutNames: program.sessions.map((session) => session.name) })),
        ...programTemplates.map((program) => ({ id: program.id, name: program.name[lang], workoutNames: program.sessions.map((session) => session.name[lang]) })),
      ]);
    }).catch(() => undefined);
    void getMobilityWeek().then((summary) => { if (mounted) setWeek(summary); }).catch(() => undefined);
    void getMobilityCycles().then((items) => { if (mounted) setCycles(items); }).catch(() => undefined);
    return () => { mounted = false; };
  }, [lang]));

  const closeCreate = () => setCreateOpen(false);
  const createItems = [
    { icon: 'add' as const, label: t('mobilityHub.createNew'), go: () => router.push({ pathname: '/mobility/routine/[id]', params: { id: 'new' } }) },
    { icon: 'download-outline' as const, label: t('mobilityHub.fromWorkout'), go: () => router.push({ pathname: '/mobility/import', params: { mode: 'workout' } }) },
    { icon: 'swap-horizontal' as const, label: t('mobilityHub.convertProgram'), go: () => router.push({ pathname: '/mobility/import', params: { mode: 'program' } }) },
  ];

  return (
    <Screen
      overlay={(
        <View pointerEvents="box-none" style={styles.fabLayer}>
          {createOpen ? (
            <View style={[styles.createMenu, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
              {createItems.map((item) => (
                <Pressable key={item.label} accessibilityRole="button" onPress={() => { closeCreate(); item.go(); }} style={styles.createItem}>
                  <Icon name={item.icon} size={20} color={palette.accentStrong} />
                  <Text style={styles.createItemText}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: createOpen }}
            accessibilityLabel={t('mobilityHub.create')}
            onPress={() => setCreateOpen((open) => !open)}
            style={({ pressed }) => [styles.fab, { backgroundColor: palette.accent, opacity: pressed ? 0.85 : 1 }]}
          >
            <Icon name={createOpen ? 'close' : 'add'} size={22} color={palette.accentText} />
            <Text style={[styles.fabText, { color: palette.accentText }]}>{t('mobilityHub.create')}</Text>
          </Pressable>
        </View>
      )}
    >
      <PageHeading title={t('mobility.title')} subtitle={t('mobility.subtitle')} />

      {recommended ? (
        <View style={[styles.suggested, { backgroundColor: palette.hero }]}>
          <View style={styles.suggestedCopy}>
            <Text style={[styles.suggestedLabel, { color: palette.heroTextMuted }]}>{t('mobilityHub.recommended')}</Text>
            <Text style={[styles.suggestedName, { color: palette.heroText }]}>{recommended.name}</Text>
            <Text style={[styles.suggestedMeta, { color: palette.heroTextMuted }]}>
              {t('mobility.minutes', { count: minutesOf(recommended) })} · {lastRun(recommended)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('mobility.start')} ${recommended.name}`}
            onPress={() => play(recommended)}
            style={({ pressed }) => [styles.suggestedPlay, { backgroundColor: palette.heroText, opacity: pressed ? 0.8 : 1 }]}
          >
            <Icon name="play" size={24} color={palette.hero} />
          </Pressable>
        </View>
      ) : null}

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

      <SectionTitle title={t('mobility.routines')} />
      {routines && routines.length > 0 ? (
        <View style={styles.filterRow}>
          <View style={styles.chips}>
            <Chip label={t('mobilityHub.filterAll')} selected={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip icon="star-outline" label={t('mobilityHub.filterFavourites')} selected={filter === 'favourites'} onPress={() => setFilter('favourites')} />
          </View>
          {groups.length > 1 ? (
            <Pressable accessibilityRole="button" onPress={toggleAll} style={styles.textAction}>
              <Text style={[styles.textActionText, { color: palette.accentStrong }]}>{allCollapsed ? t('mobilityHub.expandAll') : t('mobilityHub.collapseAll')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {routines && routines.length === 0 ? (
        <EmptyState
          icon="body-outline"
          title={t('mobility.emptyTitle')}
          body={t('mobility.emptyBody')}
          action={<View style={styles.emptyAction}><ActionButton icon="add" label={t('mobility.newRoutine')} onPress={() => router.push({ pathname: '/mobility/routine/[id]', params: { id: 'new' } })} /></View>}
        />
      ) : null}
      {routines && routines.length > 0 && shown.length === 0 ? <Text style={[styles.meta, { color: palette.textMuted }]}>{t('mobilityHub.noFavourites')}</Text> : null}
      {failed ? <Text style={[styles.meta, { color: palette.warning }]}>{t('mobility.invalid')}</Text> : null}
      {groups.map((group) => {
        const key = group.programId ?? NO_PROGRAM;
        const open = !collapsed.includes(key);
        const name = group.name ?? t('mobilityHub.ungrouped');
        const seconds = group.routines.reduce((sum, routine) => sum + estimateRoutineSeconds(routine), 0);
        return (
          <View key={key} style={styles.group}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={t(open ? 'mobilityHub.collapseGroup' : 'mobilityHub.expandGroup', { name })}
              onPress={() => toggleGroup(key)}
              style={styles.groupHead}
            >
              <Icon name={open ? 'chevron-down' : 'chevron-forward'} size={20} color={palette.textMuted} />
              <Text style={styles.groupName}>{name}</Text>
              <Text style={[styles.meta, { color: palette.textMuted }]}>{t('mobilityHub.groupMeta', { count: group.routines.length, time: formatMinutes(seconds) })}</Text>
            </Pressable>
            {open ? (
              <View style={[styles.rows, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                {group.routines.map((routine, index) => (
                  <View key={routine.id} style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t('mobility.edit')} ${routine.name}`}
                      onPress={() => router.push({ pathname: '/mobility/routine/[id]', params: { id: routine.id } })}
                      style={styles.rowCopy}
                    >
                      <View style={styles.nameRow}>
                        <Text style={styles.rowName}>{routine.name}</Text>
                        {routine.favourite ? <Icon name="star" size={16} color={palette.record} /> : null}
                      </View>
                      <Text style={[styles.meta, { color: palette.textMuted }]}>
                        {t('mobility.drills', { count: routine.steps.length })} · {t('mobility.minutes', { count: minutesOf(routine) })} · {lastRun(routine)}
                      </Text>
                    </Pressable>
                    <IconButton icon="mic-outline" tone="plain" size={48} color={palette.accentStrong} label={`${t('mobilityHub.startNarrated')} ${routine.name}`} onPress={() => play(routine, true)} />
                    <IconButton icon="play" tone="accent" size={48} label={`${t('mobilityHub.startSilent')} ${routine.name}`} onPress={() => play(routine, false)} />
                    <IconButton icon="ellipsis-vertical" tone="plain" size={48} label={t('mobilityHub.more', { name: routine.name })} onPress={() => setMenuFor(routine)} />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      {cycles.length > 0 ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: cyclesOpen }}
            accessibilityLabel={t(cyclesOpen ? 'mobilityHub.collapseGroup' : 'mobilityHub.expandGroup', { name: t('exerciseCycle.hubTitle') })}
            onPress={() => { const next = !cyclesOpen; setCyclesOpen(next); writePreference(CYCLES_OPEN_KEY, String(next)); }}
            style={styles.groupHead}
          >
            <Icon name={cyclesOpen ? 'chevron-down' : 'chevron-forward'} size={20} color={palette.textMuted} />
            <Text style={styles.groupName}>{t('exerciseCycle.hubTitle')}</Text>
            <Text style={[styles.meta, { color: palette.textMuted }]}>{cycles.length}</Text>
          </Pressable>
          {cyclesOpen ? (
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
          ) : null}
        </>
      ) : null}

      <SectionTitle title={t('mobility.tests')} />
      <ListGroup>
        <ListRow icon="analytics-outline" title={t('mobility.tests')} subtitle={t('mobility.testsBody')} onPress={() => router.push('/mobility/tests')} />
        {Platform.OS === 'web' ? null : (
          <ListRow icon="scan-outline" title={t('mobility.poseTitle')} subtitle={t('mobility.poseBody')} onPress={() => router.push('/pose')} />
        )}
      </ListGroup>
      <View style={styles.fabSpace} />

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
            <ActionButton icon="folder-outline" secondary label={t('mobilityHub.moveTo')} onPress={() => { setMoveFor(menuFor); setMenuFor(null); }} />
            <ActionButton icon="trash-outline" variant="danger" label={t('mobility.delete')} onPress={() => { setConfirmDelete(menuFor); setMenuFor(null); }} />
          </>
        ) : null}
      </Sheet>
      <Sheet visible={moveFor !== null} onClose={() => setMoveFor(null)} title={t('mobilityHub.moveTitle', { name: moveFor?.name ?? '' })} body={t('mobilityHub.moveHint')}>
        {moveFor ? (
          <MoveChoices
            routine={moveFor}
            programs={programs}
            groupPrograms={groupPrograms}
            onPick={(program) => run(() => moveMobilityRoutine(moveFor.id, program))}
          />
        ) : null}
      </Sheet>
      <Sheet visible={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title={t('mobility.delete')} body={t('mobility.deleteBody')}>
        <ActionButton icon="trash-outline" label={t('logger.confirmRemove')} variant="danger" onPress={() => { const target = confirmDelete; setConfirmDelete(null); if (target) run(() => deleteMobilityRoutine(target.id)); }} />
        <ActionButton label={t('common.cancel')} secondary onPress={() => setConfirmDelete(null)} />
      </Sheet>
    </Screen>
  );
}

function MoveChoices({ routine, programs, groupPrograms, onPick }: { routine: MobilityRoutine; programs: ProgramChoice[]; groupPrograms: GroupProgram[]; onPick: (program: { id: string; name: string } | null) => void }) {
  const { t } = useTranslation();
  const [current] = groupRoutinesByProgram([routine], groupPrograms);
  const currentId = current?.programId ?? null;
  return (
    <View style={baseStyles.moveList}>
      {[true, false].map((own) => {
        const items = programs.filter((program) => program.own === own);
        if (items.length === 0) return null;
        return (
          <View key={String(own)} style={baseStyles.moveList}>
            <Text style={baseStyles.moveLabel}>{own ? t('startFrom.yours') : t('startFrom.builtIn')}</Text>
            <ListGroup>
              {items.map((program) => (
                <ListRow key={program.id} icon={currentId === program.id ? 'radio-button-on' : 'radio-button-off'} title={program.name} subtitle={currentId === program.id ? t('mobilityHub.currentProgram') : undefined} onPress={() => onPick({ id: program.id, name: program.name })} />
              ))}
            </ListGroup>
          </View>
        );
      })}
      <ListGroup>
        <ListRow icon={currentId === null ? 'radio-button-on' : 'radio-button-off'} title={t('mobilityHub.noProgram')} onPress={() => onPick(null)} />
      </ListGroup>
    </View>
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
  fabLayer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'flex-end', justifyContent: 'flex-end', padding: 20, gap: 10 },
  fab: { minHeight: 56, borderRadius: 28, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 6 },
  fabText: { fontFamily: fonts.semibold, fontSize: 16 },
  fabSpace: { height: 72 },
  createMenu: { width: 244, borderRadius: 16, borderWidth: 1, paddingVertical: 6, elevation: 6 },
  createItem: { minHeight: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  createItemText: { fontFamily: fonts.medium, fontSize: 16, flexShrink: 1 },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  textAction: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  textActionText: { fontFamily: fonts.semibold, fontSize: 15 },
  meta: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  group: { gap: 4 },
  groupHead: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  groupName: { flex: 1, fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22 },
  rows: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4, paddingVertical: 4, minHeight: 64 },
  rowCopy: { flex: 1, minHeight: 48, justifyContent: 'center', gap: 1, paddingRight: 4 },
  rowName: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, flexShrink: 1 },
  moveList: { gap: 10 },
  moveLabel: { fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase' },
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
