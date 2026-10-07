import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionButton, Sheet, TextField } from '../../shared/components/ui';

/**
 * Name and notes of one workout, in the vocabulary of docs/LANGUAGE.md: used for a prescribed
 * workout in a program and for the workout being done, which are separate copies.
 */
export function WorkoutDetailsSheet({ visible, kind, name, notes, onSave, onClose }: {
  visible: boolean;
  kind: 'prescribed' | 'performed';
  name: string;
  notes: string | null;
  onSave: (details: { name: string; notes: string }) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draftName, setDraftName] = useState(name);
  const [draftNotes, setDraftNotes] = useState(notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draftName.trim()) { setError(t('workoutDetails.nameRequired')); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: draftName.trim(), notes: draftNotes });
    } catch {
      setError(t('workoutDetails.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t(`workoutDetails.${kind}Title`)} body={t(`workoutDetails.${kind}Body`)}>
      <TextField label={t('workoutDetails.name')} value={draftName} onChangeText={(value) => { setDraftName(value); setError(null); }} maxLength={40} error={error} />
      <TextField label={t('workoutDetails.notes')} value={draftNotes} onChangeText={setDraftNotes} placeholder={t('workoutDetails.notesPlaceholder')} multiline maxLength={1000} />
      <ActionButton label={t('common.save')} disabled={saving} onPress={() => void save()} />
      <ActionButton label={t('common.cancel')} secondary onPress={onClose} />
    </Sheet>
  );
}
