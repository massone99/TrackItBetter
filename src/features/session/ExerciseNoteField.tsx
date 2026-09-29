import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextField } from '../../shared/components/ui';
import { updateEntryNote } from './repository';

/** Note for one exercise within a workout; saves on blur and when the field goes away. */
export function ExerciseNoteField({ entryId, initial, onSaved }: { entryId: string; initial: string | null; onSaved: () => void }) {
  const { t } = useTranslation();
  const [note, setNote] = useState(initial ?? '');
  const saved = useRef(initial ?? '');
  const draft = useRef(initial ?? '');
  const onSavedRef = useRef(onSaved);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);

  const save = useCallback(() => {
    const next = draft.current.trim();
    if (next === saved.current) return;
    saved.current = next;
    void updateEntryNote(entryId, next).then(() => onSavedRef.current());
  }, [entryId]);
  useEffect(() => save, [save]);

  return (
    <TextField
      label={t('logger.exerciseNoteLabel')}
      value={note}
      onChangeText={(value) => { draft.current = value; setNote(value); }}
      onBlur={save}
      placeholder={t('logger.exerciseNotePlaceholder')}
      multiline
      maxLength={1000}
    />
  );
}
