import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ActionButton, Body, Chip, Label, Sheet, SwitchRow, TextField } from '../../shared/components/ui';
import { addApparatus } from './repository';
import { apparatusName, useEquipment } from './useEquipment';

export interface ApparatusValue {
  ids: string[];
  defaultId: string | null;
  affectsDifficulty: boolean;
}

/**
 * Exercise settings: the apparatus it can be done on (from the global list, which can grow from
 * here), the default one, and whether the apparatus changes the difficulty.
 */
export function ApparatusField({ value, onChange }: { value: ApparatusValue; onChange: (value: ApparatusValue) => void }) {
  const { t } = useTranslation();
  const { catalog, reload } = useEquipment();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  if (!catalog) return null;
  const shown = catalog.apparatus.filter((item) => !item.archived || value.ids.includes(item.id));
  const toggle = (id: string) => {
    const ids = value.ids.includes(id) ? value.ids.filter((item) => item !== id) : [...value.ids, id];
    const defaultId = value.defaultId && ids.includes(value.defaultId) ? value.defaultId : ids[0] ?? null;
    onChange({ ids, defaultId, affectsDifficulty: ids.length > 0 && value.affectsDifficulty });
  };
  const create = async () => {
    const typed = name.trim();
    if (!typed) return;
    const created = await addApparatus(typed);
    await reload();
    setAdding(false);
    setName('');
    onChange({ ...value, ids: [...value.ids, created.id], defaultId: value.defaultId ?? created.id });
  };
  return (
    <View style={styles.field}>
      <Label>{t('equipment.exerciseApparatus')}</Label>
      <View style={styles.choices}>
        {shown.map((item) => <Chip key={item.id} label={apparatusName(item, t)} selected={value.ids.includes(item.id)} onPress={() => toggle(item.id)} />)}
        <Chip icon="add" label={t('equipment.newApparatusShort')} onPress={() => setAdding(true)} />
      </View>
      {value.ids.length === 0 ? <Body>{t('equipment.exerciseApparatusNone')}</Body> : null}
      {value.ids.length > 1 ? (
        <>
          <Label>{t('equipment.defaultApparatus')}</Label>
          <View style={styles.choices}>
            {value.ids.map((id) => <Chip key={id} label={apparatusName(catalog.apparatus.find((item) => item.id === id), t)} selected={value.defaultId === id} onPress={() => onChange({ ...value, defaultId: id })} />)}
          </View>
        </>
      ) : null}
      {value.ids.length > 0 ? (
        <SwitchRow
          title={t('equipment.affectsDifficulty')}
          subtitle={t('equipment.affectsDifficultyHint')}
          value={value.affectsDifficulty}
          onChange={(affectsDifficulty) => onChange({ ...value, affectsDifficulty })}
        />
      ) : null}
      <ActionButton icon="settings-outline" label={t('equipment.manage')} variant="ghost" onPress={() => router.push('/equipment')} />
      <Sheet visible={adding} onClose={() => setAdding(false)} title={t('equipment.newApparatus')}>
        <TextField label={t('equipment.apparatusName')} value={name} onChangeText={setName} placeholder={t('equipment.newApparatusPlaceholder')} maxLength={40} autoFocus />
        <ActionButton label={t('equipment.addApparatus')} disabled={!name.trim()} onPress={() => void create()} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
