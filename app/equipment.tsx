import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { addApparatus, renameApparatus, saveBandSet, setApparatusArchived, setBandSetArchived, type Apparatus } from '../src/features/equipment/repository';
import { apparatusName, useEquipment } from '../src/features/equipment/useEquipment';
import { ActionButton, Body, EmptyState, ListGroup, ListRow, PageHeading, Screen, SectionTitle, Sheet, TextField } from '../src/shared/components/ui';
import { useTheme } from '../src/shared/theme/ThemeProvider';

/** Apparatus (bar, rings…) and band sets, shared by every exercise. */
export default function EquipmentScreen() {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const { catalog, reload } = useEquipment();
  // Back from a band set, show its new name and bands.
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<Apparatus | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!catalog) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;

  const run = async (work: () => Promise<unknown>) => {
    setError(null);
    try { await work(); await reload(); } catch { setError(t('equipment.saveError')); }
  };
  const add = () => {
    const name = newName.trim();
    if (!name) return;
    setNewName('');
    void run(() => addApparatus(name));
  };
  const createBandSet = () => void run(async () => {
    const created = await saveBandSet({ name: t('equipment.newBandSetName'), bands: [] });
    router.push({ pathname: '/band-set/[id]', params: { id: created.id } });
  });

  const active = catalog.apparatus.filter((item) => !item.archived);
  const archived = catalog.apparatus.filter((item) => item.archived);
  const bandSets = catalog.bandSets.filter((item) => !item.archived);
  const archivedSets = catalog.bandSets.filter((item) => item.archived);

  return (
    <Screen>
      <PageHeading title={t('equipment.title')} subtitle={t('equipment.subtitle')} />
      {error ? <Body style={{ color: palette.warning }}>{error}</Body> : null}

      <SectionTitle title={t('equipment.apparatusTitle')} />
      <Body>{t('equipment.apparatusHelp')}</Body>
      <ListGroup>
        {active.map((item) => (
          <ListRow key={item.id} icon="barbell-outline" title={apparatusName(item, t)} onPress={() => { setEditing(item); setDraft(apparatusName(item, t)); }} />
        ))}
      </ListGroup>
      <View style={styles.addRow}>
        <View style={styles.flex}>
          <TextField label={t('equipment.newApparatus')} value={newName} onChangeText={setNewName} placeholder={t('equipment.newApparatusPlaceholder')} maxLength={40} onSubmitEditing={add} returnKeyType="done" />
        </View>
      </View>
      <ActionButton icon="add" label={t('equipment.addApparatus')} secondary disabled={!newName.trim()} onPress={add} />
      {archived.length > 0 ? (
        <>
          <SectionTitle title={t('equipment.archived')} />
          <ListGroup>
            {archived.map((item) => (
              <ListRow key={item.id} icon="archive-outline" title={apparatusName(item, t)} subtitle={t('equipment.restore')} onPress={() => void run(() => setApparatusArchived(item.id, false))} />
            ))}
          </ListGroup>
        </>
      ) : null}

      <SectionTitle title={t('equipment.bandSetsTitle')} />
      {bandSets.length === 0 ? (
        <EmptyState icon="git-commit-outline" title={t('equipment.noBandSets')} body={t('equipment.noBandSetsBody')} />
      ) : (
        <ListGroup>
          {bandSets.map((set) => (
            <ListRow key={set.id} icon="git-commit-outline" title={set.name} subtitle={t('equipment.bandCount', { count: set.bands.length })} onPress={() => router.push({ pathname: '/band-set/[id]', params: { id: set.id } })} />
          ))}
        </ListGroup>
      )}
      <ActionButton icon="add" label={t('equipment.addBandSet')} secondary onPress={createBandSet} />
      {archivedSets.length > 0 ? (
        <ListGroup>
          {archivedSets.map((set) => (
            <ListRow key={set.id} icon="archive-outline" title={set.name} subtitle={t('equipment.restore')} onPress={() => void run(() => setBandSetArchived(set.id, false))} />
          ))}
        </ListGroup>
      ) : null}

      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing ? apparatusName(editing, t) : ''}>
        <TextField label={t('equipment.apparatusName')} value={draft} onChangeText={setDraft} maxLength={40} />
        <ActionButton label={t('common.save')} disabled={!draft.trim()} onPress={() => {
          const target = editing;
          setEditing(null);
          if (target && draft.trim() !== apparatusName(target, t)) void run(() => renameApparatus(target.id, draft));
        }} />
        <ActionButton icon="archive-outline" label={t('equipment.archive')} variant="ghost" onPress={() => {
          const target = editing;
          setEditing(null);
          if (target) void run(() => setApparatusArchived(target.id, true));
        }} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  flex: { flex: 1 },
});
