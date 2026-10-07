import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MenuList, MenuRow, TextField } from '../../shared/components/ui';
import { updateEntryNote } from './repository';

/** Note for one exercise within a workout; saves on blur and when the field goes away. */
export function ExerciseNoteField({ entryId, initial, onSaved }: { entryId: string; initial: string | null; onSaved: () => void }) {
  const { t } = useTranslation();
  const [note, setNote] = useState(initial ?? '');
  const saved = useRef(initial ?? '');
  const draft = useRef(initial ?? '');
  // Without a note the field stays folded into one row, so the menu starts compact.
  const [open, setOpen] = useState(Boolean(initial));
  const onSavedRef = useRef(onSaved);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);

  const save = useCallback(() => {
    const next = draft.current.trim();
    if (next === saved.current) return;
    saved.current = next;
    void updateEntryNote(entryId, next).then(() => onSavedRef.current());
  }, [entryId]);
  useEffect(() => save, [save]);

  if (!open) return <MenuList><MenuRow icon="create-outline" label={t('logger.exerciseNoteLabel')} onPress={() => setOpen(true)} /></MenuList>;
  return (
    <TextField
      label={t('logger.exerciseNoteLabel')}
      value={note}
      onChangeText={(value) => { draft.current = value; setNote(value); }}
      onBlur={save}
      placeholder={t('logger.exerciseNotePlaceholder')}
      multiline
      autoFocus={!initial}
      maxLength={1000}
    />
  );
}
