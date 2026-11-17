import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAutosavedText } from '../../shared/forms/useAutosavedText';
import { MenuList, MenuRow, TextField } from '../../shared/components/ui';
import { updateEntryNote } from './repository';

/** Note for one exercise within a workout, in the options sheet; saves while typing, on blur and when the field goes away. */
export function ExerciseNoteField({ entryId, initial, onSaved }: { entryId: string; initial: string | null; onSaved: () => void }) {
  const { t } = useTranslation();
  const { value, change, flush } = useAutosavedText(initial ?? '', (next) => { void updateEntryNote(entryId, next).then(onSaved); });
  // Without a note the field stays folded into one row, so the menu starts compact.
  const [open, setOpen] = useState(Boolean(initial));

  if (!open) return <MenuList><MenuRow icon="create-outline" label={t('logger.exerciseNoteLabel')} onPress={() => setOpen(true)} /></MenuList>;
  return (
    <TextField
      label={t('logger.exerciseNoteLabel')}
      value={value}
      onChangeText={change}
      onBlur={flush}
      placeholder={t('logger.exerciseNotePlaceholder')}
      multiline
      autoFocus={!initial}
      maxLength={1000}
    />
  );
}
