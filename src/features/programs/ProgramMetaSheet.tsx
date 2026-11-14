import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AUTHOR_MAX, CATEGORY_MAX, normalizeField } from '../../domain/userProgram';
import { ActionButton, Sheet } from '../../shared/components/ui';
import { ProgramMetaField, type ProgramMetaKind } from './ProgramMetaField';

const PREFIX: Record<ProgramMetaKind, 'programCategory' | 'programAuthor'> = {
  category: 'programCategory',
  author: 'programAuthor',
};

const MAX_LENGTH: Record<ProgramMetaKind, number> = {
  category: CATEGORY_MAX,
  author: AUTHOR_MAX,
};

/** Quick sheet to set, change or clear a program's category or author without leaving the view screen. */
export function ProgramMetaSheet({ kind, visible, programName, initialValue, existing, onSave, onClose }: {
  kind: ProgramMetaKind;
  visible: boolean;
  programName: string;
  initialValue: string | null | undefined;
  existing: readonly string[];
  onSave: (value: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(initialValue ?? '');
  const prefix = PREFIX[kind];

  return (
    <Sheet visible={visible} onClose={onClose} title={t(`${prefix}.change`)} subtitle={programName}>
      <ProgramMetaField kind={kind} value={draft} onChange={setDraft} existing={existing} />
      <ActionButton icon="checkmark" label={t('programCategory.save')} onPress={() => onSave(normalizeField(draft, MAX_LENGTH[kind]))} />
      {initialValue ? (
        <ActionButton icon="close-outline" label={t(`${prefix}.clear`)} secondary onPress={() => onSave(null)} />
      ) : (
        <ActionButton label={t('programCategory.cancel')} secondary onPress={onClose} />
      )}
    </Sheet>
  );
}
