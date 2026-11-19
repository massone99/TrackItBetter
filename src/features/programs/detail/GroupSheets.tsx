import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { GROUP_KINDS, type GroupKind } from '../../../domain/programStructure';
import type { UserProgram, UserProgramSession } from '../../../domain/userProgram';
import { ActionButton, CheckRow, Label, MenuList, MenuRow, SegmentedControl, Sheet, TextField } from '../../../shared/components/ui';
import { spacing } from '../../../shared/theme/tokens';
import { flatGroups, parentOptions, workoutsInGroups } from './groupEdits';

export type DetailSheet =
  | { type: 'new' }
  | { type: 'group'; groupId: string }
  | { type: 'edit'; groupId: string }
  | { type: 'parent'; groupId: string }
  | { type: 'session'; sessionId: string }
  | { type: 'move'; sessionId: string };

export interface GroupSheetsProps {
  program: UserProgram;
  sheet: DetailSheet | null;
  busy: boolean;
  onSheet: (sheet: DetailSheet | null) => void;
  onCreate: (name: string, kind: GroupKind) => void;
  onEdit: (groupId: string, change: { name: string; kind: GroupKind }) => void;
  onParent: (groupId: string, parentId: string | null) => void;
  onDuplicate: (groupId: string) => void;
  onRemove: (groupId: string) => void;
  onSelect: (groupId: string) => void;
  onMove: (sessionId: string, groupId: string | null) => void;
  onEditSession: (session: UserProgramSession) => void;
  onStart: (session: UserProgramSession) => void;
  onLogPast: (session: UserProgramSession) => void;
}

/** Name and type of a group, for a new one or an existing one. Remounted per sheet (keyed) so it starts from the right values. */
function GroupForm({ initialName, initialKind, submitLabel, onSubmit }: { initialName: string; initialKind: GroupKind; submitLabel: string; onSubmit: (name: string, kind: GroupKind) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<GroupKind>(initialKind);
  const labels: Record<GroupKind, string> = { ordered: t('programDetail.kindOrdered'), pick: t('programDetail.kindPick'), extra: t('programDetail.kindExtra') };
  return (
    <View style={{ gap: spacing.md }}>
      <TextField label={t('programDetail.nameLabel')} value={name} onChangeText={setName} placeholder={t('programDetail.namePlaceholder')} maxLength={60} returnKeyType="done" />
      <SegmentedControl value={kind} options={GROUP_KINDS.map((value) => ({ value, label: labels[value] }))} onChange={setKind} />
      <ActionButton icon="checkmark" label={submitLabel} disabled={!name.trim()} onPress={() => onSubmit(name, kind)} />
    </View>
  );
}

export function GroupSheets({ program, sheet, busy, onSheet, onCreate, onEdit, onParent, onDuplicate, onRemove, onSelect, onMove, onEditSession, onStart, onLogPast }: GroupSheetsProps) {
  const { t } = useTranslation();
  const groups = program.groups ?? [];
  const close = () => onSheet(null);
  const group = sheet && 'groupId' in sheet ? groups.find((item) => item.id === sheet.groupId) ?? null : null;
  const session = sheet && 'sessionId' in sheet ? program.sessions.find((item) => item.id === sheet.sessionId) ?? null : null;

  return (
    <>
      <Sheet visible={sheet?.type === 'new'} onClose={close} title={t('programDetail.newGroup')}>
        {sheet?.type === 'new' ? <GroupForm key="new" initialName={t('programDetail.groupName', { number: groups.length + 1 })} initialKind="ordered" submitLabel={t('programDetail.create')} onSubmit={onCreate} /> : null}
      </Sheet>

      <Sheet visible={sheet?.type === 'group' && group !== null} onClose={close} title={group?.name ?? ''}>
        {group ? (
          <MenuList>
            <MenuRow icon="create-outline" label={t('programDetail.rename')} onPress={() => onSheet({ type: 'edit', groupId: group.id })} />
            <MenuRow icon="albums-outline" label={t('programDetail.setParent')} onPress={() => onSheet({ type: 'parent', groupId: group.id })} />
            <MenuRow icon="copy-outline" label={t('programDetail.duplicateGroup')} onPress={() => onDuplicate(group.id)} />
            <MenuRow icon="checkmark-circle-outline" label={t('programDetail.selectGroups')} onPress={() => onSelect(group.id)} />
            <MenuRow icon="trash-outline" tone="danger" label={t('programDetail.removeGroup')} onPress={() => onRemove(group.id)} />
          </MenuList>
        ) : null}
      </Sheet>

      <Sheet visible={sheet?.type === 'edit' && group !== null} onClose={close} title={t('programDetail.rename')}>
        {sheet?.type === 'edit' && group ? <GroupForm key={group.id} initialName={group.name} initialKind={group.kind} submitLabel={t('programDetail.save')} onSubmit={(name, kind) => onEdit(group.id, { name, kind })} /> : null}
      </Sheet>

      <Sheet visible={sheet?.type === 'parent' && group !== null} onClose={close} title={t('programDetail.setParent')} body={group && parentOptions(groups, group.id).length === 0 && groups.some((item) => item.parentId === group.id) ? t('programDetail.parentHint') : undefined}>
        {group ? (
          <>
            <CheckRow title={t('programDetail.topLevel')} checked={!group.parentId} onChange={() => onParent(group.id, null)} />
            {parentOptions(groups, group.id).map((option) => (
              <CheckRow key={option.id} title={option.name} checked={group.parentId === option.id} onChange={() => onParent(group.id, option.id)} />
            ))}
          </>
        ) : null}
      </Sheet>

      <Sheet visible={sheet?.type === 'session' && session !== null} onClose={close} title={session?.name ?? ''}>
        {session ? (
          <MenuList>
            <MenuRow icon="create-outline" label={t('programDetail.editDetails')} onPress={() => onEditSession(session)} />
            <MenuRow icon="folder-open-outline" label={t('programDetail.moveToGroup')} onPress={() => onSheet({ type: 'move', sessionId: session.id })} />
            {busy ? null : <MenuRow icon="play" label={t('userProgram.start')} onPress={() => onStart(session)} />}
            {busy ? null : <MenuRow icon="time-outline" label={t('userProgram.logPast')} onPress={() => onLogPast(session)} />}
          </MenuList>
        ) : null}
      </Sheet>

      <Sheet visible={sheet?.type === 'move' && session !== null} onClose={close} title={t('programDetail.moveToGroup')} body={session?.name}>
        {session ? (
          <>
            {flatGroups(groups).map(({ group: option, depth }) => (
              <View key={option.id} style={{ marginLeft: depth * spacing.lg }}>
                <CheckRow title={option.name} checked={session.groupId === option.id} onChange={() => onMove(session.id, option.id)} />
              </View>
            ))}
            <CheckRow title={t('programDetail.ungrouped')} checked={!session.groupId || !groups.some((item) => item.id === session.groupId)} onChange={() => onMove(session.id, null)} />
          </>
        ) : null}
      </Sheet>
    </>
  );
}

/** The one confirmation before groups go: keep their workouts (ungrouped) or delete them too. */
export function RemoveGroupsSheet({ program, ids, onClose, onConfirm }: { program: UserProgram; ids: readonly string[] | null; onClose: () => void; onConfirm: (deleteWorkouts: boolean) => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'keep' | 'delete'>('keep');
  const set = new Set(ids ?? []);
  const names = (program.groups ?? []).filter((group) => set.has(group.id)).map((group) => group.name);
  const workouts = workoutsInGroups(program, set).length;
  const count = set.size;
  return (
    <Sheet visible={ids !== null} onClose={onClose} title={t('programDetail.removeGroupsTitle', { count })} body={names.join(', ')}>
      <SegmentedControl<'keep' | 'delete'>
        value={mode}
        onChange={setMode}
        options={[{ value: 'keep', label: t('programDetail.keepWorkouts') }, { value: 'delete', label: t('programDetail.deleteWorkouts') }]}
      />
      <Label>{workouts === 0 ? t('programDetail.keepHintNone') : t(mode === 'keep' ? 'programDetail.keepHint' : 'programDetail.deleteHint', { count: workouts })}</Label>
      <ActionButton icon="trash-outline" variant="danger" label={t('programDetail.removeGroupsAction', { count })} onPress={() => { onConfirm(mode === 'delete'); setMode('keep'); }} />
      <ActionButton label={t('common.cancel')} secondary onPress={() => { setMode('keep'); onClose(); }} />
    </Sheet>
  );
}
