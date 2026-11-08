import * as Crypto from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSaveOnLeave } from '../src/shared/forms/useSaveOnLeave';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import {
  duplicateSession,
  estimateSessionSeconds,
  moveItem,
  sessionSetCount,
  validateUserProgram,
  type ProgramError,
  type UserProgramSession,
} from '../src/domain/userProgram';
import { ReorderableList } from '../src/shared/components/ReorderableList';
import { duplicateGroup, generateWeeks, type ProgramGroup, type ProgramLayout, type ProgramStatus, type ProgressionRule } from '../src/domain/programStructure';
import { categoriesOfRow, volumeOf, type BuilderExercise } from '../src/features/programs/builder/helpers';
import { GenerateWeeksSheet } from '../src/features/programs/builder/GenerateWeeksSheet';
import { VolumeSummary } from '../src/features/programs/builder/VolumeSummary';
import { listExercises } from '../src/features/exercises/repository';
import { readDefaultRest } from '../src/features/session/restDefaults';
import { getUserProgram, saveUserProgram } from '../src/features/programs/userPrograms';
import {
  ActionButton,
  FooterAction,
  EmptyState,
  Icon,
  IconButton,
  Label,
  MenuGroup,
  MenuRow,
  PageHeading,
  Screen,
  SectionTitle,
  Sheet,
  Text,
  TextField,
  Toast,
} from '../src/shared/components/ui';
import { useInk } from '../src/shared/theme/ink';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { fonts } from '../src/shared/theme/typography';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';
import { formatMinutes } from '../src/shared/utils/format';

type Draft = { name: string; sessions: UserProgramSession[]; groups: ProgramGroup[] };

/** The program as a name, its groups and a compact list of workouts; each workout is edited on its own screen. */
export default function ProgramEditorScreen() {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const ink = useInk();
  const [initial] = useState<Draft>(() => ({ name: '', sessions: [], groups: [] }));
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState(initial.name);
  const [sessions, setSessions] = useState<UserProgramSession[]>(initial.sessions);
  const [groups, setGroups] = useState<ProgramGroup[]>(initial.groups);
  // Fields the builder does not edit but must hand back on save, or saving would drop them.
  const kept = useRef<{ status?: ProgramStatus; layout?: ProgramLayout; lastUsedAt?: string | null }>({});
  const [generateFor, setGenerateFor] = useState<string | null | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<string>(() => JSON.stringify(initial));
  const [exerciseInfo, setExerciseInfo] = useState<Map<string, BuilderExercise>>(new Map());
  const [errors, setErrors] = useState<ProgramError[]>([]);
  const [saving, setSaving] = useState(false);
  const [undo, setUndo] = useState<{ message: string; previous: UserProgramSession[]; previousGroups?: ProgramGroup[] } | null>(null);
  // Resumes a navigation held back because the edits could not be saved.
  const [leaveAction, setLeaveAction] = useState<{ resume: () => void } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const savedId = useRef<string | undefined>(undefined);

  const defaultRest = readDefaultRest('working');
  const dirty = loaded && JSON.stringify({ name, sessions, groups } satisfies Draft) !== snapshot;
  const programId = id ?? savedId.current;

  const clearError = (match: (error: ProgramError) => boolean) => setErrors((current) => current.filter((error) => !match(error)));
  const newId = () => Crypto.randomUUID();

  // Names are reloaded on focus; so is the program, because a workout is edited and saved on its own screen.
  useFocusEffect(useCallback(() => {
    let mounted = true;
    void (async () => {
      const exercises = await listExercises();
      if (!mounted) return;
      setExerciseInfo(new Map(exercises.map((exercise) => [exercise.id, { id: exercise.id, name: exercise.name, metric: exercise.metric, categories: categoriesOfRow(exercise) }])));
      const known = id ?? savedId.current;
      if (known) {
        const program = await getUserProgram(known);
        if (!mounted) return;
        if (program) {
          setName(program.name);
          setSessions(program.sessions);
          setGroups(program.groups ?? []);
          kept.current = { status: program.status, layout: program.layout, lastUsedAt: program.lastUsedAt };
          setSnapshot(JSON.stringify({ name: program.name, sessions: program.sessions, groups: program.groups ?? [] } satisfies Draft));
        }
      }
      setLoaded(true);
    })();
    return () => { mounted = false; };
  }, [id]));

  const duplicateWholeGroup = (groupId: string) => {
    const source = groups.find((group) => group.id === groupId);
    if (!source) return;
    const result = duplicateGroup({ id: '', name, sessions, updatedAt: '', groups }, groupId, newId, t('builderPlus.copyName', { name: source.name }));
    setUndo({ message: t('builderPlus.groupDuplicated', { name: source.name }), previous: sessions, previousGroups: groups });
    setGroups(result.groups ?? []);
    setSessions(result.sessions);
  };
  const generate = (groupId: string, weeks: number, rule: ProgressionRule) => {
    const result = generateWeeks({ id: '', name, sessions, updatedAt: '', groups }, groupId, weeks, rule, newId, (index) => t('builderPlus.weekName', { number: groups.length + index }));
    setGroups((current) => [...current, ...result.groups]);
    setSessions((current) => [...current, ...result.sessions]);
    setGenerateFor(undefined);
    setUndo({ message: t('builderPlus.generated', { count: result.groups.length }), previous: sessions, previousGroups: groups });
  };

  /** Validates and stores the program; false (with the errors shown) when it cannot be saved yet. */
  const persist = async (): Promise<boolean> => {
    const found = validateUserProgram({ name, sessions });
    setErrors(found);
    if (found.length > 0) return false;
    const saved = await saveUserProgram({ id: programId, name, sessions, groups: groups.length > 0 ? groups : undefined, ...kept.current });
    setSnapshot(JSON.stringify({ name: saved.name, sessions: saved.sessions, groups: saved.groups ?? [] } satisfies Draft));
    savedId.current = saved.id;
    return true;
  };

  // Leaving saves valid edits on its own; edits that cannot be saved yet ask before being dropped.
  const { allowLeave } = useSaveOnLeave({
    dirty,
    save: persist,
    onInvalid: (resume) => setLeaveAction({ resume }),
  });

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (!(await persist())) return;
      allowLeave();
      router.replace({ pathname: '/program/user/[id]', params: { id: savedId.current! } });
    } catch {
      setErrors([{ code: 'invalidValue' }]);
    } finally {
      setSaving(false);
    }
  };

  /** A workout lives inside a stored program, so the program is saved first (it needs a name). */
  const openWorkout = async (sessionId: string, groupId?: string) => {
    if (saving) return;
    if (!name.trim()) { setErrors([{ code: 'nameMissing' }]); return; }
    setSaving(true);
    try {
      if ((dirty || !programId) && !(await persist())) return;
      router.push({ pathname: '/program-workout', params: { programId: savedId.current ?? id!, sessionId, ...(groupId ? { groupId } : {}) } });
    } catch {
      setErrors([{ code: 'invalidValue' }]);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;

  const metricById = new Map([...exerciseInfo].map(([exerciseId, info]) => [exerciseId, info.metric]));
  const programVolume = volumeOf(sessions, exerciseInfo, defaultRest);
  const nameError = errors.some((error) => error.code === 'nameMissing') ? t('userProgram.errors.nameMissing') : null;
  const menuIndex = sessions.findIndex((session) => session.id === menuFor);
  const menuSession = menuIndex >= 0 ? sessions[menuIndex] : null;
  const sessionTitle = (session: UserProgramSession, index: number) => session.name || t('userProgram.dayNumber', { number: index + 1 });

  return (
    <Screen
      overlay={<Toast message={undo?.message ?? null} actionLabel={t('userProgram.undo')} onAction={() => { if (undo) { setSessions(undo.previous); if (undo.previousGroups) setGroups(undo.previousGroups); } }} onHide={() => setUndo(null)} />}
      footer={<FooterAction icon="checkmark" label={saving ? t('programBuilder.saving') : t('programBuilder.save')} disabled={saving} onPress={() => void save()} />}
    >
      <PageHeading title={id ? name || t('programBuilder.editTitle') : t('userProgram.newTitle')} subtitle={t('programBuilder.subtitle')} />
      <TextField
        label={t('programBuilder.name')}
        value={name}
        onChangeText={(value) => { setName(value); clearError((error) => error.code === 'nameMissing'); }}
        placeholder={t('programBuilder.namePlaceholder')}
        maxLength={60}
        error={nameError}
      />

      {groups.length > 0 ? (
        <>
          <SectionTitle title={t('builderPlus.groupsTitle')} />
          {groups.map((group) => (
            <View key={group.id} style={[styles.groupRow, { borderColor: palette.border }]}>
              <View style={styles.flex}>
                <Text style={styles.rowName} numberOfLines={2}>{group.name}</Text>
                <Label>{t('builderPlus.groupCount', { count: sessions.filter((session) => session.groupId === group.id).length })}</Label>
              </View>
              <IconButton icon="copy-outline" label={t('builderPlus.duplicateGroup', { name: group.name })} tone="plain" size={44} onPress={() => duplicateWholeGroup(group.id)} />
              <IconButton icon="layers-outline" label={t('builderPlus.generateFrom', { name: group.name })} tone="plain" size={44} onPress={() => setGenerateFor(group.id)} />
            </View>
          ))}
          <ActionButton icon="layers-outline" label={t('builderPlus.generate')} secondary onPress={() => setGenerateFor(null)} />
        </>
      ) : null}

      <SectionTitle title={t('userProgram.daysTitle')} />
      {sessions.length > 0 ? <VolumeSummary title={t('builderPlus.programVolume')} volume={programVolume} /> : null}
      {sessions.length === 0 ? <EmptyState icon="calendar-outline" title={t('userProgram.noWorkoutsYet')} body={t('userProgram.noWorkoutsBody')} /> : null}
      <ReorderableList
        items={sessions}
        keyOf={(session) => session.id}
        nameOf={(session) => session.name}
        gap={0}
        onMove={(from, to) => setSessions((current) => moveItem(current, from, to - from))}
        renderRow={(session, index, row) => {
          const groupName = session.groupId ? groups.find((group) => group.id === session.groupId)?.name : undefined;
          const meta = [
            t('workoutBuilder.exercises', { count: session.exercises.length }),
            t('userProgram.daySummary', { count: sessionSetCount(session), minutes: formatMinutes(estimateSessionSeconds(session, metricById, defaultRest)) }),
            groupName,
          ].filter(Boolean).join(' · ');
          return (
            <View key={session.id} style={[styles.workoutRow, { borderTopColor: ink }]}>
              {row.handle}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('workoutBuilder.openWorkout', { name: sessionTitle(session, index) })}
                onPress={() => void openWorkout(session.id)}
                style={styles.workoutMain}
              >
                <Text style={[styles.number, { color: palette.accentStrong }]}>{String(index + 1).padStart(2, '0')}</Text>
                <View style={styles.flex}>
                  <Text style={styles.workoutName} numberOfLines={2}>{sessionTitle(session, index)}</Text>
                  <Text style={[styles.meta, { color: palette.textMuted }]}>{meta}</Text>
                </View>
                <Icon name="chevron-forward" size={18} color={palette.textMuted} />
              </Pressable>
              <IconButton icon="ellipsis-vertical" tone="plain" size={44} label={t('workoutBuilder.rowMenu', { name: sessionTitle(session, index) })} onPress={() => setMenuFor(session.id)} />
            </View>
          );
        }}
      />
      <ActionButton icon="add" label={t('programBuilder.addDay')} variant="ghost" onPress={() => void openWorkout('new')} />

      {errors.length > 0 ? <Text style={[styles.error, { color: palette.warning }]}>{t('userProgram.errors.fix')}</Text> : null}

      <Sheet visible={menuSession !== null} onClose={() => setMenuFor(null)} title={menuSession ? sessionTitle(menuSession, menuIndex) : ''}>
        {menuSession ? (
          <MenuGroup>
            <MenuRow icon="create-outline" label={t('workoutBuilder.edit')} onPress={() => { setMenuFor(null); void openWorkout(menuSession.id); }} />
            <MenuRow icon="copy-outline" label={t('userProgram.duplicateDay')} onPress={() => {
              setMenuFor(null);
              setSessions((current) => {
                const copy = duplicateSession(menuSession, newId);
                return [...current.slice(0, menuIndex + 1), copy, ...current.slice(menuIndex + 1)];
              });
            }} />
            <MenuRow icon="trash-outline" tone="danger" label={t('programBuilder.removeDay')} onPress={() => {
              setMenuFor(null);
              setUndo({ message: t('userProgram.dayRemoved', { name: sessionTitle(menuSession, menuIndex) }), previous: sessions });
              setSessions((current) => current.filter((item) => item.id !== menuSession.id));
            }} />
          </MenuGroup>
        ) : null}
      </Sheet>

      <GenerateWeeksSheet
        key={generateFor === undefined ? 'closed' : generateFor ?? 'any'}
        visible={generateFor !== undefined}
        groups={groups}
        sessions={sessions}
        info={exerciseInfo}
        initialGroupId={generateFor ?? null}
        onClose={() => setGenerateFor(undefined)}
        onGenerate={generate}
      />

      <Sheet visible={leaveAction !== null} onClose={() => setLeaveAction(null)} title={t('userProgram.unsavedTitle')} body={t('userProgram.unsavedInvalidBody')}>
        <ActionButton icon="trash-outline" label={t('userProgram.discard')} variant="danger" onPress={() => {
          const action = leaveAction;
          setLeaveAction(null);
          action?.resume();
        }} />
        <ActionButton label={t('userProgram.fixFields')} secondary onPress={() => setLeaveAction(null)} />
      </Sheet>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 4, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  rowName: { fontFamily: fonts.semibold, fontSize: 16 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  workoutRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 60, borderTopWidth: StyleSheet.hairlineWidth },
  workoutMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 6 },
  number: { fontFamily: fonts.monoSemibold, fontSize: 14 },
  workoutName: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26 },
  meta: { fontFamily: fonts.mono, fontSize: 12 },
  error: { fontFamily: fonts.medium, fontSize: 14 },
});
