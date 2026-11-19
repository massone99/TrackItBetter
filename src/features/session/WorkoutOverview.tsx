import { useRef, useState, type ReactNode } from 'react';
import { ReorderableList, type ReorderRow } from '../../shared/components/ReorderableList';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { completedSetCount, groupSets } from '../../domain/setPairs';
import { ActionButton, Body, Icon, MenuList, MenuRow, Sheet, tapFeedback, Text, TextField, type IconName } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { formatClock, formatNumber } from '../../shared/utils/format';
import type { SessionExercise, SessionSet, WorkoutGroupChange } from './repository';
import { formatLoad } from './SetEntry';
import type { WorkoutGroupLayout, WorkoutSection } from './workoutGroups';

export type OverviewGroup = {
  id: string | null;
  name: string;
  exercises: SessionExercise[];
  parent?: { id: string | null; name: string; exercises: SessionExercise[] };
  nested?: OverviewGroup[];
  marker?: string;
};

export type GroupSheet = { view: 'options' | 'edit' | 'delete'; group: OverviewGroup }
  | { view: 'create'; parent?: OverviewGroup };

const groupKey = (group: OverviewGroup) => group.parent ? `superset:${group.id}` : `group:${group.id ?? 'loose'}`;

export function useOverviewGroups(sections: WorkoutSection[], layout: WorkoutGroupLayout | null | undefined): OverviewGroup[] {
  const { t } = useTranslation();
  let letter = 0;
  return sections.map(({ group, exercises }) => {
    const name = !group ? t('liveWorkout.loose') : group.name ?? t(group.block === 'main' ? 'liveWorkout.main' : `workout.blocks.${group.block}`);
    const parent = { id: group?.id ?? null, name, exercises };
    const ids = new Set(exercises.flatMap((entry) => entry.groupId ? [entry.groupId] : []));
    const nested = [...ids].flatMap((id) => {
      const members = exercises.filter((entry) => entry.groupId === id);
      if (members.length < 2) return [];
      const suffix = String.fromCharCode(65 + letter++);
      return [{
        id,
        name: layout?.supersets.find((item) => item.id === id)?.name ?? t('superset.label', { letter: suffix }),
        marker: suffix,
        exercises: members,
        parent,
      }];
    });
    return { ...parent, nested };
  });
}

export function exerciseValue(exercise: SessionExercise, set: SessionSet, reps: string): string {
  if (exercise.metric === 'time' || exercise.metric === 'time_load') return (set.durationSec ?? 0) < 60 ? `${set.durationSec ?? 0} s` : formatClock(set.durationSec ?? 0);
  if (exercise.metric === 'distance') return `${formatNumber(set.distanceM ?? 0)} m`;
  return `${set.reps ?? 0} ${reps}`;
}

export function WorkoutExerciseRow({ exercise, next, marker, expanded, onPress }: {
  exercise: SessionExercise; next: boolean; marker?: string; expanded?: boolean; onPress: () => void;
}) {
  const { t } = useTranslation();
  const { palette, mode } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const sets = groupSets(exercise.sets);
  const done = completedSetCount(exercise.sets);
  const finished = done > 0 && done === sets.length;
  const open = exercise.sets.find((set) => !set.completedAt);
  const shown = open ?? exercise.sets.at(-1);
  const setNumber = sets.findIndex((set) => set.some(({ id }) => id === open?.id)) + 1;
  const value = shown ? exerciseValue(exercise, shown, t('history.units.reps')) : '';
  const hint = next && open
    ? t('liveWorkout.nextSet', { number: setNumber, value })
    : [
      value && shown?.durationSec && !finished ? t('liveWorkout.valuePerSet', { value }) : value,
      shown?.addedLoadKg ? formatLoad(shown.addedLoadKg) : null,
      shown?.bands.length ? t('liveWorkout.bandHelp') : null,
      finished ? t('liveWorkout.completed') : null,
    ].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="button" accessibilityState={expanded === undefined ? undefined : { expanded }} aria-expanded={expanded}
      accessibilityLabel={exercise.name}
      accessibilityHint={[hint, exercise.notes, t('liveWorkout.count', { done, total: sets.length })].filter(Boolean).join(' · ')}
      onLongPress={() => {}}
      delayLongPress={350}
      onPress={() => { tapFeedback(); onPress(); }}
      style={({ pressed }) => [styles.exercise, { borderColor: palette.border, backgroundColor: next ? mode === 'light' ? '#e8ebfb' : palette.accentSoft : palette.surface }, pressed && { opacity: 0.72 }]}>
      {marker ? <Text style={[styles.smallMono, { color: palette.textMuted }]}>{marker}</Text> : null}
      <View style={styles.flex}>
        <Text style={styles.exerciseName}>{exercise.name}</Text>
        {hint ? <Text style={[styles.hint, { color: next ? palette.accentStrong : palette.textMuted }]}>{hint}</Text> : null}
        {exercise.notes ? (
          <View style={styles.noteLine}>
            <Icon name="document-text-outline" size={11} color={palette.accentStrong} />
            <Text numberOfLines={1} style={[styles.notePreview, { color: palette.textMuted }]}>{exercise.notes}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.exerciseProgress}>
        <Text style={[styles.exerciseCount, { color: finished ? palette.success : palette.text }]}>{done}/{sets.length}</Text>
        {sets.length > 0 && sets.length <= 10 ? <View style={styles.ticks}>{sets.map((set) => (
          <View key={set[0].id} style={[styles.tick, { backgroundColor: set.every((side) => side.completedAt) ? palette.success : next && set.some(({ id }) => id === open?.id) ? palette.accentStrong : palette.border }]} />
        ))}</View> : null}
      </View>
      <Icon name={expanded ? 'chevron-up' : 'chevron-forward'} size={15} color={palette.textMuted} />
    </Pressable>
  );
}

export function OverviewButton({ label, accessibilityLabel, icon, onPress, accent, disabled, grow }: {
  label: string; accessibilityLabel?: string; icon?: IconName; onPress: () => void; accent?: boolean; disabled?: boolean; grow?: boolean;
}) {
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const color = disabled ? palette.textMuted : accent ? palette.accentStrong : palette.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled}
    onPress={() => { tapFeedback(); onPress(); }}
    style={({ pressed }) => [styles.button, grow && styles.grow, {
      borderColor: accent ? palette.accentStrong : palette.border,
      backgroundColor: accent && !grow ? palette.accentSoft : palette.surface,
      opacity: disabled ? 0.6 : pressed ? 0.72 : 1,
    }]}>
    {icon ? <Icon name={icon} size={15} color={color} /> : null}
    <Text style={[styles.buttonText, (grow || !icon && !accent) && styles.footerButtonText, { color }]}>{label}</Text>
  </Pressable>;
}

export function WorkoutOverview({ groups, folded, nextId, onFold, onFoldAll, onGroupSheet, renderExercise, canMove, onMove }: {
  groups: OverviewGroup[]; folded: ReadonlySet<string>; nextId: string | null;
  onFold: (key: string) => void; onFoldAll: (keys: string[]) => void; onGroupSheet: (sheet: GroupSheet) => void;
  canMove: (exercise: SessionExercise, offset: -1 | 1) => boolean;
  onMove: (exercise: SessionExercise, target: SessionExercise) => Promise<void>;
  renderExercise: (exercise: SessionExercise, marker?: string, wrapDrag?: ReorderRow['wrapDrag']) => ReactNode;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  async function move(exercise: SessionExercise, target: SessionExercise) {
    if (pending.current) return;
    pending.current = true;
    setFailed(false);
    try { await onMove(exercise, target); }
    catch { setFailed(true); }
    finally { pending.current = false; }
  }
  const keys = groups.flatMap((group) => [groupKey(group), ...(group.nested ?? []).map(groupKey)]);
  const section = (group: OverviewGroup) => {
    const key = groupKey(group);
    const closed = folded.has(key);
    const done = group.exercises.reduce((count, entry) => count + completedSetCount(entry.sets), 0);
    const total = group.exercises.reduce((count, entry) => count + groupSets(entry.sets).length, 0);
    const next = closed ? group.exercises.find((entry) => entry.entryId === nextId) : undefined;
    const nested = Boolean(group.parent);
    return (
      <View key={key} style={nested ? [styles.nested, { borderColor: palette.border }] : styles.group}>
        <View style={[styles.groupHeader, nested && { backgroundColor: palette.surfaceMuted, borderColor: palette.border, borderBottomWidth: closed ? 0 : 1 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={group.name} accessibilityState={{ expanded: !closed }} aria-expanded={!closed}
            accessibilityHint={t('liveWorkout.count', { done, total })} onPress={() => { tapFeedback(); onFold(key); }}
            style={[styles.fold, nested && styles.nestedFold]}>
            <Icon name={closed ? 'chevron-forward' : 'chevron-down'} size={15} color={palette.textMuted} />
            {nested ? <Icon name="link" size={13} color={palette.textMuted} /> : null}
            <View style={styles.flex}>
              <Text style={nested ? styles.nestedTitle : styles.groupTitle}>{group.name}</Text>
              {next ? <Text style={[styles.hint, { color: palette.accentStrong }]}>{t('liveWorkout.nextExercise', { name: next.name })}</Text> : null}
            </View>
            <Text style={[styles.smallMono, { color: palette.textMuted }]}>{t('liveWorkout.count', { done, total })}</Text>
          </Pressable>
          {group.id !== null || group.exercises.length >= 2 ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('liveWorkout.groupOptions', { name: group.name })}
              onPress={() => { tapFeedback(); onGroupSheet({ view: 'options', group }); }}
              style={[styles.groupMenu, { borderColor: palette.border, backgroundColor: nested ? palette.surfaceMuted : palette.surface }]}>
              <Icon name="ellipsis-horizontal" size={16} color={palette.text} />
            </Pressable>
          ) : null}
        </View>
        {closed ? null : group.exercises.map((exercise, index, entries) => {
          const child = group.nested?.find((item) => item.id === exercise.groupId);
          if (child) return child.exercises[0].entryId === exercise.entryId ? section(child) : null;
          if (index > 0 && canMove(exercise, -1)) return null;
          let end = index;
          while (end + 1 < entries.length && canMove(entries[end], 1)) end++;
          if (end === index) return <View key={exercise.entryId}>{renderExercise(exercise)}</View>;
          const run = entries.slice(index, end + 1);
          return <ReorderableList key={groupKey(group) + index} items={run} gap={nested ? 0 : 4}
            keyOf={(item) => item.entryId} nameOf={(item) => item.name}
            onMove={(from, to) => void move(run[from], run[to])}
            renderRow={(item, position, row) => renderExercise(item, nested ? `${group.marker ?? ''}${index + position + 1}` : undefined, row.wrapDrag)} />;
        })}
      </View>
    );
  };
  return (
    <View style={styles.overview}>
      <View style={[styles.toolbar, { borderColor: palette.border }]}>
        <OverviewButton label={t('common.collapseAll')} icon="contract-outline" disabled={keys.every((key) => folded.has(key))} onPress={() => onFoldAll(keys)} />
        <OverviewButton label={t('common.expandAll')} icon="expand-outline" disabled={!keys.some((key) => folded.has(key))} onPress={() => onFoldAll([])} />
        <View style={styles.newGroup}>
          <OverviewButton label={t('liveWorkout.group')} accent onPress={() => onGroupSheet({ view: 'create' })} />
        </View>
      </View>
      {groups.some((group) => group.exercises.some((exercise) => canMove(exercise, 1))) ? (
        <Text style={[styles.hint, { color: palette.textMuted }]}>{t('liveWorkout.dragHint')}</Text>
      ) : null}
      {failed ? <Text accessibilityRole="alert">{t('liveWorkout.saveFailed')}</Text> : null}
      {groups.map(section)}
    </View>
  );
}

export function WorkoutGroupSheet({ sheet, groups, exercises, onClose, onChange, onSave }: {
  sheet: GroupSheet; groups: OverviewGroup[]; exercises: SessionExercise[]; onClose: () => void;
  onChange: (sheet: GroupSheet) => void; onSave: (change: WorkoutGroupChange) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const group = 'group' in sheet ? sheet.group : undefined;
  const parent = sheet.view === 'create' ? sheet.parent : group?.parent;
  const nested = Boolean(parent);
  const [name, setName] = useState(sheet.view === 'edit' ? group?.name ?? '' : '');
  const [selected, setSelected] = useState(() => new Set(sheet.view === 'edit' ? group?.exercises.map((entry) => entry.entryId) : []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  async function save(change: WorkoutGroupChange) {
    if (saving) return;
    setSaving(true);
    setError(false);
    try { await onSave(change); onClose(); }
    catch { setError(true); setSaving(false); }
  }
  const message = error ? <Text accessibilityRole="alert" style={{ color: palette.warning }}>{t('liveWorkout.saveFailed')}</Text> : null;
  const close = () => { if (!saving) onClose(); };
  const cancel = <ActionButton compact secondary label={t('common.cancel')} disabled={saving} onPress={close} />;

  if (sheet.view === 'options' && group) {
    const namedGroups = groups.filter((item) => item.id !== null);
    const position = nested ? -1 : namedGroups.findIndex((item) => item.id === group.id);
    return <Sheet visible compact onClose={close} title={group.name}>
      <MenuList>
        {group.id ? <MenuRow icon="create-outline" label={t(nested ? 'liveWorkout.editSuperset' : 'liveWorkout.editGroup')} onPress={() => onChange({ view: 'edit', group })} /> : null}
        {!nested && group.exercises.length >= 2 ? <MenuRow icon="link" label={t('liveWorkout.createSuperset')} onPress={() => onChange({ view: 'create', parent: group })} /> : null}
        {group.id && position > 0 ? <MenuRow icon="arrow-up" label={t('liveWorkout.moveUp')} onPress={() => void save({ type: 'moveGroup', id: group.id!, offset: -1 })} /> : null}
        {group.id && position >= 0 && position < namedGroups.length - 1 ? <MenuRow icon="arrow-down" label={t('liveWorkout.moveDown')} onPress={() => void save({ type: 'moveGroup', id: group.id!, offset: 1 })} /> : null}
        {group.id ? <MenuRow icon="trash-outline" tone="danger" label={t(nested ? 'liveWorkout.deleteSuperset' : 'liveWorkout.deleteGroup')} onPress={() => onChange({ view: 'delete', group })} /> : null}
      </MenuList>
      {message}
      <View style={styles.actions}>{cancel}</View>
    </Sheet>;
  }
  if (sheet.view === 'delete' && group?.id) {
    return <Sheet visible compact onClose={close} title={t('liveWorkout.deleteTitle', { name: group.name })}>
      <Body>{group.exercises.length ? t('liveWorkout.deleteBody', { destination: parent?.name ?? t('liveWorkout.loose') }) : t('liveWorkout.emptyGroup')}</Body>
      {message}
      <View style={styles.actions}>{cancel}<ActionButton compact variant="danger" label={t('liveWorkout.delete')} disabled={saving}
        onPress={() => void save({ type: nested ? 'deleteSuperset' : 'deleteGroup', id: group.id! })} /></View>
    </Sheet>;
  }
  const title = t(sheet.view === 'edit' ? nested ? 'liveWorkout.editSuperset' : 'liveWorkout.editGroup' : nested ? 'liveWorkout.newSuperset' : 'liveWorkout.newGroup');
  return <Sheet visible compact onClose={close} title={title}>
    <TextField label={t('liveWorkout.title')} accessibilityLabel={t('liveWorkout.title')} value={name} onChangeText={setName}
      maxLength={80} editable={!saving} placeholder={t(nested ? 'liveWorkout.supersetPlaceholder' : 'liveWorkout.groupPlaceholder')} />
    {exercises.length ? (
      <View>
        <Text style={styles.formLabel}>{t(nested ? 'liveWorkout.supersetMembers' : 'liveWorkout.members')}</Text>
        {exercises.map((entry) => {
          const owner = groups.find((item) => item.exercises.some(({ entryId }) => entryId === entry.entryId));
          const from = owner?.nested?.find((item) => item.id === entry.groupId)?.name ?? owner?.name;
          const checked = selected.has(entry.entryId);
          return <Pressable key={entry.entryId} accessibilityRole="checkbox" accessibilityState={{ checked, disabled: saving }} disabled={saving}
            accessibilityLabel={entry.name} onPress={() => {
              tapFeedback();
              setSelected((current) => {
                const next = new Set(current);
                if (next.has(entry.entryId)) next.delete(entry.entryId); else next.add(entry.entryId);
                return next;
              });
            }} style={[styles.checkboxRow, { borderColor: palette.border }]}>
            <View style={[styles.checkbox, { borderColor: checked ? palette.accentStrong : palette.textMuted, backgroundColor: checked ? palette.accent : palette.surface }]}>
              {checked ? <Icon name="checkmark" size={14} color={palette.accentText} /> : null}
            </View>
            <View style={styles.flex}><Text style={styles.formLabel}>{entry.name}</Text>
              {from ? <Text style={[styles.hint, { color: palette.textMuted }]}>{from}</Text> : null}</View>
          </Pressable>;
        })}
      </View>
    ) : null}
    {nested && selected.size < 2 ? <Body>{t('liveWorkout.minimum')}</Body> : null}
    {message}
    <View style={styles.actions}>{cancel}<ActionButton compact label={t('common.save')} disabled={saving || !name.trim() || (nested && selected.size < 2)}
      onPress={() => void save(parent
        ? { type: 'superset', id: group?.id ?? undefined, parentId: parent.id, name, entryIds: [...selected] }
        : { type: 'group', id: group?.id ?? undefined, name, entryIds: [...selected] })} /></View>
  </Sheet>;
}

const baseStyles = StyleSheet.create({
  overview: { gap: 8 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolbar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingBottom: 8, borderBottomWidth: 1 },
  newGroup: { marginLeft: 'auto' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 44, borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 6 },
  grow: { flexGrow: 1, flexShrink: 1 },
  buttonText: { fontFamily: fonts.semibold, fontSize: 11, flexShrink: 1 },
  footerButtonText: { fontSize: 14 },
  group: { gap: 4 },
  nested: { borderWidth: 1, borderRadius: 4, overflow: 'hidden' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fold: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  nestedFold: { paddingHorizontal: 8 },
  groupTitle: { fontFamily: fonts.display, fontSize: 21, lineHeight: 24 },
  nestedTitle: { fontFamily: fonts.semibold, fontSize: 13 },
  groupMenu: { minWidth: 38, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderRadius: 4 },
  exercise: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 4, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 10, minHeight: 61 },
  flex: { flex: 1, minWidth: 0 },
  exerciseName: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 19 },
  exerciseProgress: { alignItems: 'flex-end', gap: 3 },
  exerciseCount: { fontFamily: fonts.monoSemibold, fontSize: 13 },
  smallMono: { fontFamily: fonts.mono, fontSize: 11 },
  ticks: { flexDirection: 'row', gap: 2 },
  tick: { width: 8, height: 3 },
  hint: { fontSize: 12, lineHeight: 16 },
  noteLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  notePreview: { flex: 1, fontSize: 11 },
  formLabel: { fontFamily: fonts.semibold, fontSize: 14 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderTopWidth: 1, minHeight: 44, paddingHorizontal: 4, paddingVertical: 5 },
  checkbox: { width: 18, height: 18, borderWidth: 1, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
});
