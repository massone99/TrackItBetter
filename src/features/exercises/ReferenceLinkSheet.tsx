import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';
import { ActionButton, Sheet, TextField } from '../../shared/components/ui';
import { normalizeVideoUrl } from '../../shared/utils/url';
import { setExerciseDemoUrl } from './repository';

export function openReferenceVideo(url: string) {
  void Linking.openURL(url).catch(() => undefined);
}

/**
 * Edits the form reference link of an exercise. Mount it with a `key` that changes when it
 * opens so the draft starts from the saved link.
 */
export function ReferenceLinkSheet({ visible, exerciseId, exerciseName, currentUrl, onClose, onSaved }: {
  visible: boolean;
  exerciseId: string;
  exerciseName: string;
  currentUrl: string | null;
  onClose: () => void;
  onSaved: (url: string | null) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(currentUrl ?? '');
  const [invalid, setInvalid] = useState(false);

  const save = async (value: string) => {
    const normalized = normalizeVideoUrl(value);
    if (normalized === undefined) { setInvalid(true); return; }
    await setExerciseDemoUrl(exerciseId, normalized);
    onSaved(normalized);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('logger.reference')} body={exerciseName}>
      <TextField
        value={draft}
        onChangeText={(value) => { setDraft(value); setInvalid(false); }}
        placeholder={t('logger.referencePlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        inputMode="url"
        returnKeyType="done"
        onSubmitEditing={() => void save(draft)}
        hint={t('logger.referenceHint')}
        error={invalid ? t('logger.referenceInvalid') : null}
      />
      <ActionButton icon="link" label={t('logger.referenceSave')} onPress={() => void save(draft)} />
      {currentUrl ? <ActionButton icon="play-circle-outline" label={t('logger.referenceOpen')} secondary onPress={() => openReferenceVideo(currentUrl)} /> : null}
      {currentUrl ? <ActionButton icon="trash-outline" label={t('logger.referenceRemove')} variant="danger" onPress={() => void save('')} /> : null}
    </Sheet>
  );
}
