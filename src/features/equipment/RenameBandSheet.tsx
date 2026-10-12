import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionButton, Sheet, Text, TextField } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { renameBand } from './repository';

/** Renames a band from wherever it is shown (workout picker, band order); `onDone` reloads the list. */
export function RenameBandSheet({ band, onClose, onDone }: { band: { id: string; name: string } | null; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const value = draft ?? band?.name ?? '';
  const close = () => { setDraft(null); setFailed(false); onClose(); };
  const save = async () => {
    if (!band || !value.trim()) return;
    try {
      await renameBand(band.id, value);
      setDraft(null);
      setFailed(false);
      onDone();
      onClose();
    } catch {
      setFailed(true);
    }
  };
  return (
    <Sheet visible={band !== null} onClose={close} title={t('equipment.renameBand')}>
      <TextField label={t('equipment.bandName')} value={value} onChangeText={setDraft} placeholder={t('equipment.bandNamePlaceholder')} maxLength={30} onSubmitEditing={() => void save()} returnKeyType="done" />
      {failed ? <Text style={{ color: palette.warning }}>{t('equipment.saveError')}</Text> : null}
      <ActionButton label={t('common.save')} disabled={!value.trim() || value.trim() === band?.name} onPress={() => void save()} />
      <ActionButton label={t('common.cancel')} secondary onPress={close} />
    </Sheet>
  );
}
