import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { duplicateGroup, type GroupKind, type ProgramLayout } from '../../../src/domain/programStructure';
import { moveItem, nextSessionInRotation, type UserProgram, type UserProgramSession } from '../../../src/domain/userProgram';
import { listExercises } from '../../../src/features/exercises/repository';
import { addGroup, buildSections, doneSessionIds, editGroup, moveSessionToGroup, removeGroups, setGroupParent, withFirstGroup, type SectionNode } from '../../../src/features/programs/detail/groupEdits';
import { GroupSheets, RemoveGroupsSheet, type DetailSheet } from '../../../src/features/programs/detail/GroupSheets';
import { GroupsView } from '../../../src/features/programs/detail/GroupsView';
import { CompactSession, SessionCard, type ExerciseInfo, type SessionViewProps } from '../../../src/features/programs/detail/SessionCard';
import { defaultPastStart } from '../../../src/features/session/pastStart';
import { logPastUserProgramSession, startUserProgramSession } from '../../../src/features/programs/startUserSession';
import { deleteUserProgram, duplicateUserProgram, getUserProgram, saveUserProgram, updateUserProgram } from '../../../src/features/programs/userPrograms';
import { WorkoutDetailsSheet } from '../../../src/features/session/WorkoutDetailsSheet';
import { WorkoutInProgressSheet } from '../../../src/features/session/WorkoutInProgressSheet';
import { getActiveWorkout, listRecentWorkoutNames } from '../../../src/features/session/repository';
import { ReorderableList } from '../../../src/shared/components/ReorderableList';
import { ActionButton, Body, FooterAction, EmptyState, IconButton, PageHeading, Screen, SectionTitle, SegmentedControl, Sheet, tapFeedback, Text, Toast } from '../../../src/shared/components/ui';
import { goBack } from '../../../src/shared/navigation/goBack';
import { useTheme } from '../../../src/shared/theme/ThemeProvider';
import { fonts } from '../../../src/shared/theme/typography';
import { useScaledStyles } from '../../../src/shared/theme/useScaledStyles';

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
  const [editing, setEditing] = useState<UserProgramSession | null>(null);
  const [opened, setOpened] = useState<Set<string>>(() => new Set());  // every workout starts folded each time the program is entered, not persisted
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});  // sections opened or folded by hand, per visit
  const [sheet, setSheet] = useState<DetailSheet | null>(null);
  // Select-groups mode, the groups waiting for the removal confirmation, and the program before the last removal.
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [removal, setRemoval] = useState<string[] | null>(null);
  const [undo, setUndo] = useState<{ message: string; previous: UserProgram } | null>(null);

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
  const nextSession = nextSessionInRotation(program, recentNames);
  const nextId = nextSession?.id ?? null;
  const layout: ProgramLayout = program.layout ?? 'sequence';

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

  const saveOpened = (next: Set<string>) => {
    tapFeedback();
    setOpened(next);
  };
  const toggle = (sessionId: string) => {
    const next = new Set(opened);
    if (!next.delete(sessionId)) next.add(sessionId);
    saveOpened(next);
  };
  const allCollapsed = program.sessions.length > 0 && program.sessions.every((session) => !opened.has(session.id));

  const fail = (reason: unknown) => setError(`${t('programBuilder.startError')} (${reason instanceof Error ? reason.message : String(reason)})`);

  const reorder = async (from: number, to: number) => {
    const previous = program;
    const next = { ...program, sessions: moveItem(program.sessions, from, to - from) };
    setProgram(next);
    try {
      setProgram(await saveUserProgram(next));
    } catch (reason) {
      setProgram(previous);
      fail(reason);
    }
  };

  const duplicate = async () => {
    const copy = await duplicateUserProgram(program.id, t('userProgram.copyName', { name: program.name }));
    if (copy) router.replace({ pathname: '/program/user/[id]', params: { id: copy.id } });
  };

  /** Applies a structural change on the stored program (fresh read), then shows the result. */
  const change = async (fn: (current: UserProgram) => Partial<UserProgram>) => {
    setError(null);
    try {
      const saved = await updateUserProgram(program.id, fn);
      if (saved) setProgram(saved);
    } catch (reason) {
      fail(reason);
    }
  };

  const setLayout = (next: ProgramLayout) => {
    if (next === layout) return;
    // Weeks and Groups need a group: a program without any gets one holding every workout, so nothing disappears.
    void change((current) => ({
      layout: next,
      ...(next === 'sequence' ? {} : withFirstGroup(current, t(next === 'weeks' ? 'programDetail.weekName' : 'programDetail.groupName', { number: 1 }), Crypto.randomUUID)),
    }));
  };

  const editWorkout = (session: UserProgramSession) => router.push({ pathname: '/program-workout', params: { programId: program.id, sessionId: session.id } });

  const openMenu = (session: UserProgramSession) => {
    if (layout === 'sequence') editWorkout(session);
    else setSheet({ type: 'session', sessionId: session.id });
  };

  const viewProps = (session: UserProgramSession, number: number): SessionViewProps => ({
    session,
    number,
    isNext: session.id === nextId,
    open: opened.has(session.id),
    starting,
    info,
    metricById,
    onToggle: () => toggle(session.id),
    onMenu: () => openMenu(session),
    onStart: () => void start(session),
    onLogPast: () => void logPast(session),
  });

  const sections = layout === 'sequence' ? [] : buildSections(program, doneSessionIds(program, recentNames), nextId);
  const renderSession = (section: SectionNode, index: number, mode: 'card' | 'compact') => {
    const session = section.sessions[index];
    const props = viewProps(session, index + 1);
    return mode === 'compact' && !props.open ? <CompactSession {...props} /> : <SessionCard {...props} />;
  };

  const layoutLabels: Record<ProgramLayout, string> = { sequence: t('programDetail.layoutSequence'), weeks: t('programDetail.layoutWeeks'), groups: t('programDetail.layoutGroups') };

  return (
    <Screen
      // The next workout in the rotation starts from the bottom of the screen, wherever the list is scrolled.
      overlay={<Toast message={undo?.message ?? null} actionLabel={t('userProgram.undo')} onAction={() => { if (undo) { const { previous } = undo; void change(() => ({ groups: previous.groups ?? [], sessions: previous.sessions })); } }} onHide={() => setUndo(null)} />}
      footer={selection !== null ? (
        <>
          <FooterAction icon="trash-outline" label={t('programDetail.removeGroupsAction', { count: selection.size })} disabled={selection.size === 0} onPress={() => setRemoval([...selection])} />
          <FooterAction secondary label={t('programDetail.selectCancel')} onPress={() => setSelection(null)} />
        </>
      ) : nextSession ? (
        <FooterAction
          icon="play"
          label={starting === nextSession.id ? t('programBuilder.starting') : `${t('userProgram.start')} · ${nextSession.name}`}
          disabled={starting !== null}
          onPress={() => void start(nextSession)}
        />
      ) : undefined}
    >
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

      <SegmentedControl value={layout} options={(['sequence', 'weeks', 'groups'] as const).map((value) => ({ value, label: layoutLabels[value] }))} onChange={setLayout} />

      {layout === 'sequence' && program.sessions.length > 0 ? <Body>{t('userProgram.rotationHelp')}</Body> : null}
      {layout === 'sequence' ? (
        <SectionTitle
          title={t('userProgram.daysTitle')}
          action={program.sessions.length > 1 ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { tapFeedback(); setOpened(allCollapsed ? new Set(program.sessions.map((session) => session.id)) : new Set()); }}>
              <Text style={[styles.toggleAll, { color: palette.accentStrong }]}>{allCollapsed ? t('userProgram.expandAll') : t('userProgram.collapseAll')}</Text>
            </Pressable>
          ) : undefined}
        />
      ) : null}
      {program.sessions.length === 0 ? (
        <EmptyState
          icon="albums-outline"
          title={t('userProgram.noWorkoutsYet')}
          body={t('userProgram.noWorkoutsBody')}
          action={<View style={styles.emptyAction}><ActionButton icon="add" label={t('programBuilder.addDay')} onPress={() => router.push({ pathname: '/program-workout', params: { programId: program.id, sessionId: 'new' } })} /></View>}
        />
      ) : null}
      {layout === 'sequence' ? (
        <ReorderableList
          items={program.sessions}
          keyOf={(session) => session.id}
          nameOf={(session) => session.name}
          onMove={(from, to) => void reorder(from, to)}
          renderRow={(session, index, row) => <SessionCard {...viewProps(session, index + 1)} handle={program.sessions.length > 1 ? row.handle : null} />}
        />
      ) : (
        <GroupsView
          layout={layout}
          sections={sections}
          openMap={groupOpen}
          onSetOpen={(sectionId, open) => setGroupOpen((current) => ({ ...current, [sectionId]: open }))}
          onMenu={(section) => section.group && setSheet({ type: 'group', groupId: section.group.id })}
          onNewGroup={() => setSheet({ type: 'new' })}
          selection={selection}
          onToggle={(groupId) => setSelection((current) => { const next = new Set(current ?? []); if (!next.delete(groupId)) next.add(groupId); return next; })}
          onSelectAll={() => setSelection((current) => {
            const all = sections.flatMap((section) => (section.group ? [section.group.id, ...section.children.map((child) => child.id)] : []));
            return current && all.every((groupId) => current.has(groupId)) ? new Set() : new Set(all);
          })}
          onStartSelect={() => setSelection(new Set())}
          renderSession={renderSession}
        />
      )}

      <GroupSheets
        program={program}
        sheet={sheet}
        busy={starting !== null}
        onSheet={setSheet}
        onCreate={(name, kind: GroupKind) => { setSheet(null); void change((current) => addGroup(current, name, kind, Crypto.randomUUID)); }}
        onEdit={(groupId, edit) => { setSheet(null); void change((current) => editGroup(current, groupId, edit)); }}
        onParent={(groupId, parentId) => { setSheet(null); void change((current) => setGroupParent(current, groupId, parentId)); }}
        onDuplicate={(groupId) => { setSheet(null); void change((current) => duplicateGroup(current, groupId, Crypto.randomUUID, t('programDetail.groupCopy', { name: current.groups?.find((group) => group.id === groupId)?.name ?? '' }))); }}
        onRemove={(groupId) => { setSheet(null); setRemoval([groupId]); }}
        onSelect={(groupId) => { setSheet(null); setSelection(new Set([groupId])); }}
        onMove={(sessionId, groupId) => { setSheet(null); void change((current) => moveSessionToGroup(current, sessionId, groupId)); }}
        onEditSession={(session) => { setSheet(null); editWorkout(session); }}
        onStart={(session) => { setSheet(null); void start(session); }}
        onLogPast={(session) => { setSheet(null); void logPast(session); }}
      />

      <WorkoutDetailsSheet
        key={editing?.id ?? 'none'}
        visible={editing !== null}
        kind="prescribed"
        name={editing?.name ?? ''}
        notes={editing?.notes ?? null}
        onClose={() => setEditing(null)}
        onSave={async (details) => {
          const target = editing;
          if (!target) return;
          const saved = await saveUserProgram({ ...program, sessions: program.sessions.map((session) => (session.id === target.id ? { ...session, ...details } : session)) });
          setProgram(saved);
          setEditing(null);
        }}
      />

      <RemoveGroupsSheet
        program={program}
        ids={removal}
        onClose={() => setRemoval(null)}
        onConfirm={(deleteWorkouts) => {
          const ids = new Set(removal ?? []);
          const previous = program;
          setRemoval(null);
          setSelection(null);
          setUndo({ message: t('programDetail.groupsRemoved', { count: ids.size }), previous });
          void change((current) => removeGroups(current, ids, deleteWorkouts));
        }}
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emptyAction: { alignSelf: 'stretch', marginTop: 6 },
  toggleAll: { fontFamily: fonts.semibold, fontSize: 14, paddingVertical: 12 },
  error: { fontFamily: fonts.medium, fontSize: 14 },
});
