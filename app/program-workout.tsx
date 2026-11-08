import * as Crypto from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { BLOCKS, blockOf, usesBlocks, type Block } from '../src/domain/blocks';
import {
  newPrescription,
  replaceExercise,
  validateUserProgram,
  type ProgramError,
  type UserProgram,
  type UserProgramExercise,
  type UserProgramSession,
} from '../src/domain/userProgram';
import { ExercisePicker } from '../src/features/exercises/ExercisePicker';
import { openExercisePage } from '../src/features/exercises/openExercise';
import { listExercises } from '../src/features/exercises/repository';
import { applyBulk, categoriesOfRow, volumeOf, type BuilderExercise, type BulkChange } from '../src/features/programs/builder/helpers';
import { BulkEditSheet } from '../src/features/programs/builder/BulkEditSheet';
import { QuickAddLine } from '../src/features/programs/builder/QuickAddLine';
import { takePendingExercise } from '../src/features/programs/pendingExercise';
import { startUserProgramSession } from '../src/features/programs/startUserSession';
import { getUserProgram, updateUserProgram } from '../src/features/programs/userPrograms';
import { ExerciseEditSheet } from '../src/features/programs/workout/ExerciseEditSheet';
import { ExerciseRow } from '../src/features/programs/workout/ExerciseRow';
import { WorkoutSummary } from '../src/features/programs/workout/WorkoutSummary';
import { duplicateExercise, moveInBlock, normalizeBlocks, prescriptionLine, setBlock, workingSetCount } from '../src/features/programs/workout/workoutOps';
import { getActiveWorkout } from '../src/features/session/repository';
import { readDefaultRest } from '../src/features/session/restDefaults';
import { WorkoutInProgressSheet } from '../src/features/session/WorkoutInProgressSheet';
import { TextInput } from '../src/shared/components/AppTextInput';
import { ReorderableList } from '../src/shared/components/ReorderableList';
import { ShowMore, usePaged } from '../src/shared/components/paging';
import {
  ActionButton,
  Chip,
  EmptyState,
  FooterAction,
  Label,
  MenuGroup,
  MenuRow,
  PageHeading,
  Screen,
  SectionTitle,
  Sheet,
  Tag,
  Text,
  TextField,
  Toast,
} from '../src/shared/components/ui';
import { useSaveOnLeave } from '../src/shared/forms/useSaveOnLeave';
import { goBack } from '../src/shared/navigation/goBack';
import { useInk } from '../src/shared/theme/ink';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { fonts } from '../src/shared/theme/typography';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';

/** Exercises shown at a time; a longer workout gets "Show more". */
const PAGE = 30;

type Menu = { exerciseId: string } | null;

/** One workout of a program: name, notes, group, and its exercises as dense rows. */
export default function ProgramWorkoutScreen() {
  const styles = useScaledStyles(baseStyles);
  const { programId, sessionId, groupId } = useLocalSearchParams<{ programId: string; sessionId: string; groupId?: string }>();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const ink = useInk();
  const isNew = sessionId === 'new';
  // A new workout gets its id up front, so an exercise created elsewhere can find its way back to it.
  const [freshId] = useState(() => Crypto.randomUUID());
  const sid = isNew ? freshId : sessionId;

  const [program, setProgram] = useState<UserProgram | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [draft, setDraft] = useState<UserProgramSession | null>(null);
  const [snapshot, setSnapshot] = useState('');
  const [info, setInfo] = useState<Map<string, BuilderExercise>>(new Map());
  const [errors, setErrors] = useState<ProgramError[]>([]);
  const [saving, setSaving] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ message: string; previous: UserProgramExercise[] } | null>(null);
  const [leaveAction, setLeaveAction] = useState<{ resume: () => void } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [picker, setPicker] = useState<{ query: string; replaceId?: string } | null>(null);
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [groupSheet, setGroupSheet] = useState(false);
  const [blockedBy, setBlockedBy] = useState<{ id: string; name: string } | null>(null);

  const defaultRest = readDefaultRest('working');
  const dirty = status === 'ready' && draft !== null && JSON.stringify(draft) !== snapshot;

  const patchDraft = (patch: Partial<UserProgramSession>) => setDraft((current) => (current ? { ...current, ...patch } : current));
  const setExercises = (change: (list: UserProgramExercise[]) => UserProgramExercise[]) => setDraft((current) => (current ? { ...current, exercises: change(current.exercises) } : current));
  const clearError = (match: (error: ProgramError) => boolean) => setErrors((current) => current.filter((error) => !match(error)));
  const patchExercise = (id: string, patch: Partial<UserProgramExercise>) => {
    setExercises((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    clearError((error) => error.exerciseId === id);
  };
  const newId = () => Crypto.randomUUID();

  const addPrescription = (prescription: UserProgramExercise, edit: boolean) => {
    setExercises((list) => normalizeBlocks([...list, prescription]));
    clearError((error) => error.code === 'sessionEmpty');
    if (edit) setEditingId(prescription.id);
  };
  const replaceIn = (prescriptionId: string, exerciseId: string, metric: string, oldMetric: string | undefined) => {
    setExercises((list) => list.map((item) => (item.id === prescriptionId ? replaceExercise(item, exerciseId, oldMetric, metric) : item)));
    clearError((error) => error.exerciseId === prescriptionId);
  };

  // Names are reloaded on focus so a movement created from the picker shows up by name and joins this workout.
  useFocusEffect(useCallback(() => {
    let mounted = true;
    void (async () => {
      const [exercises, found] = await Promise.all([listExercises(), status === 'loading' ? getUserProgram(programId) : Promise.resolve(null)]);
      if (!mounted) return;
      const infoById = new Map(exercises.map((exercise): [string, BuilderExercise] => [exercise.id, { id: exercise.id, name: exercise.name, metric: exercise.metric, categories: categoriesOfRow(exercise) }]));
      setInfo(infoById);
      if (status === 'loading') {
        const existing = found?.sessions.find((session) => session.id === sid);
        if (!found || (!existing && !isNew)) { setStatus('missing'); return; }
        const initial: UserProgramSession = existing ?? {
          id: sid,
          name: t('userProgram.dayNumber', { number: found.sessions.length + 1 }),
          exercises: [],
          ...(groupId && found.groups?.some((group) => group.id === groupId) ? { groupId } : {}),
        };
        setProgram(found);
        setDraft(initial);
        setSnapshot(JSON.stringify(initial));
        setStatus('ready');
      }
      const created = takePendingExercise();
      if (created && created.sessionId === sid) {
        if (created.replaceId) replaceIn(created.replaceId, created.exerciseId, created.metric, undefined);
        else addPrescription(newPrescription(created.exerciseId, created.metric, newId), true);
      }
    })();
    return () => { mounted = false; };
    // Runs on focus and once the program is loaded; the helpers it calls only use state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, sid, status]));

  /** Validates and stores the workout inside its program; null (errors shown) when it cannot be saved yet. */
  const persist = async (): Promise<UserProgram | null> => {
    if (!draft) return null;
    const found = validateUserProgram({ name: program?.name || '-', sessions: [draft] });
    setErrors(found);
    if (found.length > 0) {
      const bad = found.find((error) => error.exerciseId);
      if (bad?.exerciseId) setEditingId(bad.exerciseId);
      return null;
    }
    const saved = await updateUserProgram(programId, (current) => ({
      sessions: current.sessions.some((session) => session.id === draft.id)
        ? current.sessions.map((session) => (session.id === draft.id ? draft : session))
        : [...current.sessions, draft],
    }));
    if (!saved) throw new Error('Program not found');
    setProgram(saved);
    setSnapshot(JSON.stringify(draft));
    return saved;
  };

  const { allowLeave } = useSaveOnLeave({
    dirty,
    save: async () => (await persist()) !== null,
    onInvalid: (resume) => setLeaveAction({ resume }),
  });

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (dirty && !(await persist())) return;
      allowLeave();
      goBack({ pathname: '/program/user/[id]', params: { id: programId } });
    } catch {
      setErrors([{ code: 'invalidValue' }]);
    } finally {
      setSaving(false);
    }
  };

  const startNow = async () => {
    if (saving || !draft) return;
    setSaving(true);
    setStartError(null);
    try {
      const active = await getActiveWorkout();
      if (active) { setBlockedBy({ id: active.id, name: active.name }); return; }
      const saved = dirty || isNew ? await persist() : program;
      if (!saved) return;
      const workoutId = await startUserProgramSession(saved, draft);
      allowLeave();
      router.replace({ pathname: '/workout/[id]', params: { id: workoutId } });
    } catch (reason) {
      setStartError(`${t('programBuilder.startError')} (${reason instanceof Error ? reason.message : String(reason)})`);
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading') return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (status === 'missing' || !draft || !program) {
    return (
      <Screen>
        <PageHeading title={t('workoutBuilder.notFound')} />
        <ActionButton label={t('userProgram.allPrograms')} onPress={() => router.replace('/programs')} />
      </Screen>
    );
  }

  const metricOf = (exerciseId: string) => info.get(exerciseId)?.metric;
  const nameOf = (exerciseId: string) => info.get(exerciseId)?.name ?? t('userProgram.exerciseMissing');
  const ordered = normalizeBlocks(draft.exercises);
  const volume = volumeOf([draft], info, defaultRest);
  const showBlocks = usesBlocks(ordered.map((item) => ({ block: item.block ?? null })));
  const editing = editingId ? draft.exercises.find((item) => item.id === editingId) ?? null : null;
  const menuTarget = menu ? draft.exercises.find((item) => item.id === menu.exerciseId) ?? null : null;
  const replacing = picker?.replaceId ? draft.exercises.find((item) => item.id === picker.replaceId) : undefined;
  const group = program.groups?.find((item) => item.id === draft.groupId);
  const hasGroups = (program.groups?.length ?? 0) > 0;
  const nameMissing = errors.some((error) => error.code === 'sessionNameMissing');
  const selecting = selection !== null;

  const removeWithUndo = (id: string) => {
    const target = draft.exercises.find((item) => item.id === id);
    if (!target) return;
    setUndo({ message: t('userProgram.exerciseRemoved', { name: nameOf(target.exerciseId) }), previous: draft.exercises });
    setExercises((list) => list.filter((item) => item.id !== id));
  };
  const toggleSelected = (id: string) => setSelection((current) => {
    const next = new Set(current ?? []);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const applyBulkChange = (change: BulkChange) => {
    const ids = selection ?? new Set<string>();
    setExercises((list) => list.map((item) => (ids.has(item.id) ? applyBulk(item, change) : item)));
    setBulkOpen(false);
    setSelection(null);
  };

  return (
    <Screen
      overlay={<Toast message={undo?.message ?? null} actionLabel={t('userProgram.undo')} onAction={() => { if (undo) setExercises(() => undo.previous); }} onHide={() => setUndo(null)} />}
      footer={selecting ? (
        <>
          <FooterAction icon="options-outline" label={t('builderPlus.editTogether', { count: selection.size })} disabled={selection.size === 0} onPress={() => setBulkOpen(true)} />
          <FooterAction secondary label={t('builderPlus.selectCancel')} onPress={() => setSelection(null)} />
        </>
      ) : (
        <>
          <FooterAction icon="checkmark" label={saving ? t('workoutBuilder.saving') : t(dirty || isNew ? 'workoutBuilder.save' : 'workoutBuilder.done')} disabled={saving} onPress={() => void save()} />
          <FooterAction secondary icon="play" label={t('workoutBuilder.startNow')} disabled={saving} onPress={() => void startNow()} />
        </>
      )}
    >
      <PageHeading title={isNew ? t('workoutBuilder.newTitle') : t('workoutBuilder.title')} subtitle={program.name} />

      <View style={styles.nameBox}>
        <TextInput
          accessibilityLabel={t('programBuilder.sessionName')}
          value={draft.name}
          onChangeText={(name) => { patchDraft({ name }); clearError((error) => error.code === 'sessionNameMissing'); }}
          placeholder={t('programBuilder.sessionDefault')}
          placeholderTextColor={palette.textMuted}
          maxLength={40}
          multiline
          style={[styles.nameInput, { color: palette.text, borderBottomColor: nameMissing ? palette.warning : ink }]}
        />
        {nameMissing ? <Text style={[styles.error, { color: palette.warning }]}>{t('userProgram.errors.sessionNameMissing')}</Text> : null}
      </View>
      <TextField
        label={t('workoutDetails.notes')}
        value={draft.notes ?? ''}
        onChangeText={(notes) => patchDraft({ notes })}
        placeholder={t('workoutDetails.notesPlaceholder')}
        multiline
        maxLength={1000}
      />
      {hasGroups ? (
        <View style={styles.chips}>
          <Chip icon="layers-outline" label={group?.name ?? t('programDetail.ungrouped')} accessibilityLabel={t('workoutBuilder.groupChip', { name: group?.name ?? t('programDetail.ungrouped') })} onPress={() => setGroupSheet(true)} />
        </View>
      ) : null}

      <WorkoutSummary exercises={draft.exercises.length} workingSets={workingSetCount(draft)} volume={volume} />

      <SectionTitle
        title={t('workoutBuilder.exercisesTitle')}
        action={draft.exercises.length > 1 ? <Chip label={selecting ? t('builderPlus.selectCancel') : t('builderPlus.select')} icon="checkmark-circle-outline" selected={selecting} onPress={() => setSelection(selecting ? null : new Set())} /> : undefined}
      />
      {draft.exercises.length === 0 ? <EmptyState icon="barbell-outline" title={t('workoutBuilder.emptyTitle')} body={t('workoutBuilder.emptyBody')} /> : null}
      <Paged
        items={ordered}
        renderShown={(shown, more) => (
          <>
            {BLOCKS.map((block) => {
              const items = shown.filter((item) => blockOf(item.block) === block);
              if (items.length === 0) return null;
              return (
                <View key={block} style={styles.block}>
                  {showBlocks ? (
                    <View style={[styles.blockHead, { borderBottomColor: ink }]}>
                      <Tag>{t(`workout.blocks.${block}`)}</Tag>
                      <Tag>{String(ordered.filter((item) => blockOf(item.block) === block).length)}</Tag>
                    </View>
                  ) : null}
                  <ReorderableList
                    items={items}
                    keyOf={(item) => item.id}
                    nameOf={(item) => nameOf(item.exerciseId)}
                    gap={0}
                    onMove={(from, to) => setExercises((list) => moveInBlock(list, block, from, to))}
                    renderRow={(prescription, _index, row) => (
                      <ExerciseRow
                        key={prescription.id}
                        name={nameOf(prescription.exerciseId)}
                        line={prescriptionLine(prescription, metricOf(prescription.exerciseId))}
                        hasNote={Boolean(prescription.note?.trim())}
                        invalid={errors.some((error) => error.exerciseId === prescription.id)}
                        selecting={selecting}
                        picked={selection?.has(prescription.id) ?? false}
                        handle={row.handle}
                        onPress={() => (selecting ? toggleSelected(prescription.id) : setEditingId(prescription.id))}
                        onMenu={() => setMenu({ exerciseId: prescription.id })}
                        onOpenExercise={() => openExercisePage(prescription.exerciseId)}
                      />
                    )}
                  />
                </View>
              );
            })}
            {more}
          </>
        )}
      />
      {errors.some((error) => error.code === 'sessionEmpty') ? <Text style={[styles.error, { color: palette.warning }]}>{t('userProgram.errors.sessionEmpty')}</Text> : null}

      <QuickAddLine
        exercises={info}
        newId={newId}
        onAdd={(prescription) => addPrescription(prescription, false)}
        onNoMatch={(query) => setPicker({ query })}
      />
      <ActionButton icon="add" label={t('programBuilder.addExercise')} secondary onPress={() => setPicker({ query: '' })} />
      {errors.length > 0 ? <Text style={[styles.error, { color: palette.warning }]}>{t('userProgram.errors.fix')}</Text> : null}
      {startError ? <Text style={[styles.error, { color: palette.warning }]}>{startError}</Text> : null}

      <ExercisePicker
        visible={picker !== null}
        initialQuery={picker?.query ?? ''}
        title={picker?.replaceId ? t('userProgram.replaceTitle') : t('programBuilder.addExercise')}
        subtitle={picker?.replaceId ? (replacing ? nameOf(replacing.exerciseId) : undefined) : draft.name}
        onChoose={(choice) => {
          if (picker?.replaceId) replaceIn(picker.replaceId, choice.id, choice.metric, replacing ? metricOf(replacing.exerciseId) : undefined);
          else addPrescription(newPrescription(choice.id, choice.metric, newId), true);
          setPicker(null);
        }}
        onCreate={(name) => {
          const replaceId = picker?.replaceId;
          setPicker(null);
          router.push({ pathname: '/exercise/new', params: { addToProgram: sid, ...(replaceId ? { replaceProgramExercise: replaceId } : {}), ...(name ? { name } : {}) } });
        }}
        onClose={() => setPicker(null)}
      />

      <ExerciseEditSheet
        prescription={editing}
        name={editing ? nameOf(editing.exerciseId) : ''}
        metric={editing ? metricOf(editing.exerciseId) ?? 'reps' : 'reps'}
        position={editing ? t('programBuilder.exerciseOf', { number: ordered.findIndex((item) => item.id === editing.id) + 1, total: ordered.length }) : ''}
        onChange={(patch) => editing && patchExercise(editing.id, patch)}
        onBlock={(block) => editing && setExercises((list) => setBlock(list, editing.id, block))}
        onReplace={() => { if (editing) { setPicker({ query: '', replaceId: editing.id }); setEditingId(null); } }}
        onRemove={() => { if (editing) { const id = editing.id; setEditingId(null); removeWithUndo(id); } }}
        onClose={() => setEditingId(null)}
      />

      <Sheet visible={menuTarget !== null} onClose={() => setMenu(null)} title={menuTarget ? nameOf(menuTarget.exerciseId) : ''}>
        {menuTarget ? (
          <MenuGroup>
            <MenuRow icon="create-outline" label={t('workoutBuilder.edit')} onPress={() => { setMenu(null); setEditingId(menuTarget.id); }} />
            <MenuRow icon="copy-outline" label={t('workoutBuilder.duplicate')} onPress={() => {
              const name = nameOf(menuTarget.exerciseId);
              setMenu(null);
              setUndo({ message: t('workoutBuilder.duplicated', { name }), previous: draft.exercises });
              setExercises((list) => duplicateExercise(list, menuTarget.id, newId));
            }} />
            {BLOCKS.filter((block) => block !== blockOf(menuTarget.block)).map((block: Block) => (
              <MenuRow key={block} icon="arrow-redo-outline" label={t('workoutBuilder.moveTo', { block: t(`workout.blocks.${block}`) })} onPress={() => { setMenu(null); setExercises((list) => setBlock(list, menuTarget.id, block)); }} />
            ))}
            {draft.exercises.length > 1 ? <MenuRow icon="checkmark-circle-outline" label={t('builderPlus.select')} onPress={() => { setMenu(null); setSelection(new Set([menuTarget.id])); }} /> : null}
            <MenuRow icon="trash-outline" tone="danger" label={t('userProgram.removeExercise', { name: nameOf(menuTarget.exerciseId) })} onPress={() => { setMenu(null); removeWithUndo(menuTarget.id); }} />
          </MenuGroup>
        ) : null}
      </Sheet>

      <Sheet visible={groupSheet} onClose={() => setGroupSheet(false)} title={t('programDetail.moveToGroup')} body={draft.name}>
        <MenuGroup>
          <MenuRow icon={draft.groupId ? 'remove-outline' : 'checkmark'} label={t('programDetail.ungrouped')} onPress={() => { setGroupSheet(false); patchDraft({ groupId: undefined }); }} />
          {(program.groups ?? []).map((item) => (
            <MenuRow key={item.id} icon={draft.groupId === item.id ? 'checkmark' : 'layers-outline'} label={item.name} onPress={() => { setGroupSheet(false); patchDraft({ groupId: item.id }); }} />
          ))}
        </MenuGroup>
        <Label>{t('workoutBuilder.groupHint')}</Label>
      </Sheet>

      <BulkEditSheet visible={bulkOpen} count={selection?.size ?? 0} onClose={() => setBulkOpen(false)} onApply={applyBulkChange} />
      <WorkoutInProgressSheet active={blockedBy} onClose={() => setBlockedBy(null)} />

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

/** Pages the rows (30 at a time) and hands the "Show more" button to the caller to place after them. */
function Paged<T>({ items, renderShown }: { items: readonly T[]; renderShown: (shown: T[], more: React.ReactNode) => React.ReactNode }) {
  const page = usePaged(items, PAGE);
  return <>{renderShown(page.shown, <ShowMore remaining={page.remaining} onPress={page.more} />)}</>;
}

const baseStyles = StyleSheet.create({
  nameBox: { gap: 4 },
  nameInput: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, minHeight: 48, borderBottomWidth: 1, paddingVertical: 4, paddingHorizontal: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  block: { gap: 0 },
  blockHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, paddingVertical: 6 },
  error: { fontFamily: fonts.medium, fontSize: 14 },
});
