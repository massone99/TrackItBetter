import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { estimateSessionSeconds, moveItem, nextSessionInRotation, sessionSetCount, type UserProgram, type UserProgramSession } from '../../../src/domain/userProgram';
import { listExercises } from '../../../src/features/exercises/repository';
import { openExercisePage } from '../../../src/features/exercises/openExercise';
import { describePrescription } from '../../../src/features/programs/describe';
import { defaultPastStart } from '../../../src/features/session/pastStart';
import { logPastUserProgramSession, startUserProgramSession } from '../../../src/features/programs/startUserSession';
import { deleteUserProgram, duplicateUserProgram, getUserProgram, saveUserProgram } from '../../../src/features/programs/userPrograms';
import { readDefaultRest } from '../../../src/features/session/restDefaults';
import { WorkoutInProgressSheet } from '../../../src/features/session/WorkoutInProgressSheet';
import { getActiveWorkout, listRecentWorkoutNames } from '../../../src/features/session/repository';
import { ReorderableList } from '../../../src/shared/components/ReorderableList';
import { ActionButton, Body, Card, EmptyState, Icon, IconButton, Label, PageHeading, Screen, SectionTitle, Sheet, tapFeedback, Text } from '../../../src/shared/components/ui';
import { readPreference, writePreference } from '../../../src/shared/settings/preferences';
import { goBack } from '../../../src/shared/navigation/goBack';
import { useTheme } from '../../../src/shared/theme/ThemeProvider';
import { fonts } from '../../../src/shared/theme/typography';
import { useScaledStyles } from '../../../src/shared/theme/useScaledStyles';
import { formatMinutes } from '../../../src/shared/utils/format';

type ExerciseInfo = { name: string; metric: string };

/** Workouts the person collapsed in a program, remembered per program. */
const collapsedKey = (programId: string) => `program.${programId}.collapsed`;
function readCollapsed(programId: string): Set<string> {
  try {
    const stored: unknown = JSON.parse(readPreference(collapsedKey(programId)) ?? '[]');
    return new Set(Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

export default function UserProgramScreen() {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [program, setProgram] = useState<UserProgram | null>(null);
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<Map<string, ExerciseInfo>>(new Map());
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [active, setActive] = useState<{ id: string; name: string } | null>(null);
  const [blockedBy, setBlockedBy] = useState<{ id: string; name: string } | null>(null);
  const [recentNames, setRecentNames] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readCollapsed(id));

  useFocusEffect(useCallback(() => {
    let mounted = true;
    void Promise.all([getUserProgram(id), listExercises(), getActiveWorkout(), listRecentWorkoutNames()]).then(([found, exercises, activeWorkout, names]) => {
      if (!mounted) return;
      setRecentNames(names);
      setProgram(found);
      setInfo(new Map(exercises.map((exercise) => [exercise.id, { name: exercise.name, metric: exercise.metric }])));
      setActive(activeWorkout ? { id: activeWorkout.id, name: activeWorkout.name } : null);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [id]));

  if (loading) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (!program) {
    return (
      <Screen>
        <PageHeading title={t('userProgram.notFound')} />
        <ActionButton label={t('userProgram.allPrograms')} onPress={() => router.replace('/programs')} />
      </Screen>
    );
  }

  const metricById = new Map([...info].map(([exerciseId, item]) => [exerciseId, item.metric]));
  const nextId = nextSessionInRotation(program, recentNames)?.id ?? null;

  const start = async (session: UserProgramSession) => {
    if (starting) return;
    if (active) { setBlockedBy(active); return; }
    setStarting(session.id);
    setError(null);
    try {
      const workoutId = await startUserProgramSession(program, session);
      router.replace({ pathname: '/workout/[id]', params: { id: workoutId } });
    } catch (reason) {
      setError(`${t('programBuilder.startError')} (${reason instanceof Error ? reason.message : String(reason)})`);
    } finally {
      setStarting(null);
    }
  };

  /** Logs this day as a finished session (yesterday evening by default) and opens it to set the day and time. */
  const logPast = async (session: UserProgramSession) => {
    if (starting) return;
    setStarting(session.id);
    setError(null);
    try {
      const workoutId = await logPastUserProgramSession(program, session, defaultPastStart(null), 60);
      router.push({ pathname: '/workout/history/[id]', params: { id: workoutId, edit: '1' } });
    } catch (reason) {
      setError(`${t('programBuilder.startError')} (${reason instanceof Error ? reason.message : String(reason)})`);
    } finally {
      setStarting(null);
    }
  };

  const saveCollapsed = (next: Set<string>) => {
    tapFeedback();
    setCollapsed(next);
    writePreference(collapsedKey(program.id), JSON.stringify([...next]));
  };
  const toggle = (sessionId: string) => {
    const next = new Set(collapsed);
    if (!next.delete(sessionId)) next.add(sessionId);
    saveCollapsed(next);
  };
  const allCollapsed = program.sessions.length > 0 && program.sessions.every((session) => collapsed.has(session.id));

  const reorder = async (from: number, to: number) => {
    const previous = program;
    const next = { ...program, sessions: moveItem(program.sessions, from, to - from) };
    setProgram(next);
    try {
      setProgram(await saveUserProgram(next));
    } catch (reason) {
      setProgram(previous);
      setError(`${t('programBuilder.startError')} (${reason instanceof Error ? reason.message : String(reason)})`);
    }
  };

  const duplicate = async () => {
    const copy = await duplicateUserProgram(program.id, t('userProgram.copyName', { name: program.name }));
    if (copy) router.replace({ pathname: '/program/user/[id]', params: { id: copy.id } });
  };

  return (
    <Screen>
      <PageHeading
        title={program.name}
        subtitle={program.sessions.length > 0 ? t('userProgram.daysPerWeek', { count: program.sessions.length }) : t('userProgram.noWorkoutsYet')}
        action={
          <View style={styles.actions}>
            <IconButton icon="copy-outline" label={t('userProgram.duplicate')} onPress={() => void duplicate()} />
            <IconButton icon="create-outline" tone="accent" label={t('programBuilder.edit')} onPress={() => router.push({ pathname: '/program-builder', params: { id: program.id } })} />
          </View>
        }
      />

      {active ? <Body>{t('userProgram.activeWorkout', { name: active.name })}</Body> : null}
      {error ? <Text style={[styles.error, { color: palette.warning }]}>{error}</Text> : null}

      {program.sessions.length > 0 ? <Body>{t('userProgram.rotationHelp')}</Body> : null}
      <SectionTitle
        title={t('userProgram.daysTitle')}
        action={program.sessions.length > 1 ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => saveCollapsed(allCollapsed ? new Set() : new Set(program.sessions.map((session) => session.id)))}>
            <Text style={[styles.toggleAll, { color: palette.accentStrong }]}>{allCollapsed ? t('userProgram.expandAll') : t('userProgram.collapseAll')}</Text>
          </Pressable>
        ) : undefined}
      />
      {program.sessions.length === 0 ? (
        <EmptyState
          icon="albums-outline"
          title={t('userProgram.noWorkoutsYet')}
          body={t('userProgram.noWorkoutsBody')}
          action={<View style={styles.emptyAction}><ActionButton icon="add" label={t('programBuilder.addDay')} onPress={() => router.push({ pathname: '/program-builder', params: { id: program.id } })} /></View>}
        />
      ) : null}
      <ReorderableList
        items={program.sessions}
        keyOf={(session) => session.id}
        nameOf={(session) => session.name}
        onMove={(from, to) => void reorder(from, to)}
        renderRow={(session, index, row) => (
        <Card style={[styles.session, session.id === nextId && { borderColor: palette.accentStrong }]}>
          <View style={styles.sessionTop}>
            {program.sessions.length > 1 ? row.handle : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: !collapsed.has(session.id) }}
              accessibilityLabel={collapsed.has(session.id) ? t('userProgram.expandDay', { name: session.name }) : t('userProgram.collapseDay', { name: session.name })}
              onPress={() => toggle(session.id)}
              style={styles.sessionHead}
            >
              <View style={styles.flex}>
                <Label style={session.id === nextId ? { color: palette.accentStrong } : undefined}>
                  {session.id === nextId ? `${t('userProgram.dayNumber', { number: index + 1 })} · ${t('userProgram.nextLabel')}` : t('userProgram.dayNumber', { number: index + 1 })}
                </Label>
                <Text style={styles.sessionName}>{session.name}</Text>
              </View>
              <View style={styles.headMeta}>
                <Label>{t('userProgram.daySummary', { count: sessionSetCount(session), minutes: formatMinutes(estimateSessionSeconds(session, metricById, readDefaultRest('working'))) })}</Label>
                <Icon name={collapsed.has(session.id) ? 'chevron-down' : 'chevron-up'} size={20} color={palette.textMuted} />
              </View>
            </Pressable>
            {collapsed.has(session.id) ? (
              <IconButton
                icon="play"
                tone={session.id === nextId ? 'accent' : 'muted'}
                label={`${t('userProgram.start')} ${session.name}`}
                disabled={starting !== null}
                onPress={() => void start(session)}
              />
            ) : null}
          </View>
          {collapsed.has(session.id) ? (
            <Text numberOfLines={2} style={[styles.target, { color: palette.textMuted }]}>
              {session.exercises.map((prescription) => info.get(prescription.exerciseId)?.name ?? t('userProgram.exerciseMissing')).join(' · ')}
            </Text>
          ) : session.exercises.map((prescription) => (
            <Pressable
              key={prescription.id}
              accessibilityRole="button"
              accessibilityLabel={info.get(prescription.exerciseId)?.name ?? t('userProgram.exerciseMissing')}
              accessibilityHint={t('logger.openExerciseHint')}
              onLongPress={() => openExercisePage(prescription.exerciseId)}
              accessibilityActions={[{ name: 'longpress', label: t('logger.openExercise') }]}
              onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') openExercisePage(prescription.exerciseId); }}
              style={[styles.exerciseRow, { borderTopColor: palette.border }]}
            >
              <Text style={styles.exerciseName} numberOfLines={2}>{info.get(prescription.exerciseId)?.name ?? t('userProgram.exerciseMissing')}</Text>
              <Text style={[styles.target, { color: palette.textMuted }]}>{describePrescription(prescription, metricById.get(prescription.exerciseId), t)}</Text>
              {prescription.note?.trim() ? <Text style={[styles.target, { color: palette.text }]}>{prescription.note.trim()}</Text> : null}
            </Pressable>
          ))}
          {collapsed.has(session.id) ? null : (
            <>
              <ActionButton
                icon="play"
                label={starting === session.id ? t('programBuilder.starting') : t('userProgram.start')}
                secondary={session.id !== nextId}
                disabled={starting !== null}
                onPress={() => void start(session)}
              />
              <ActionButton icon="time-outline" label={t('userProgram.logPast')} variant="ghost" disabled={starting !== null} onPress={() => void logPast(session)} />
            </>
          )}
        </Card>
        )}
      />

      <WorkoutInProgressSheet active={blockedBy} onClose={() => setBlockedBy(null)} />

      <ActionButton icon="trash-outline" label={t('programBuilder.delete')} variant="danger" onPress={() => setConfirmDelete(true)} />

      <Sheet visible={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('programBuilder.deleteTitle')} body={t('programBuilder.deleteBody', { name: program.name })}>
        <ActionButton icon="trash-outline" label={t('programBuilder.delete')} variant="danger" onPress={() => {
          setConfirmDelete(false);
          void deleteUserProgram(program.id).then(() => goBack('/programs'));
        }} />
        <ActionButton label={t('common.cancel')} secondary onPress={() => setConfirmDelete(false)} />
      </Sheet>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  flex: { flex: 1, gap: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emptyAction: { alignSelf: 'stretch', marginTop: 6 },
  session: { gap: 12 },
  sessionTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionHead: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headMeta: { alignItems: 'flex-end', gap: 4 },
  toggleAll: { fontFamily: fonts.semibold, fontSize: 14, paddingVertical: 12 },
  sessionName: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30 },
  exerciseRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 5 },
  exerciseName: { fontFamily: fonts.semibold, fontSize: 15 },
  target: { fontFamily: fonts.medium, fontSize: 14 },
  error: { fontFamily: fonts.medium, fontSize: 14 },
});
