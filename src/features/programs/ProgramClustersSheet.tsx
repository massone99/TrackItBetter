import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { CLUSTER_MAX, normalizeClusterName, normalizeClusters } from '../../domain/userProgram';
import { ActionButton, Body, Chip, Label, Sheet, TextField } from '../../shared/components/ui';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';

/** Sheet to toggle multi-cluster membership for a program and create new custom clusters inline. */
export function ProgramClustersSheet({ visible, programName, selectedClusters, allClusters, onSave, onCreateCluster, onClose }: {
  visible: boolean;
  programName: string;
  selectedClusters: readonly string[];
  allClusters: readonly string[];
  onSave: (nextClusters: string[]) => void;
  onCreateCluster: (name: string) => void;
  onClose: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>(() => normalizeClusters(selectedClusters));
  const [available, setAvailable] = useState<string[]>(() => normalizeClusters([...allClusters, ...selectedClusters]).sort((a, b) => a.localeCompare(b)));
  const [draft, setDraft] = useState('');

  const toggle = (cluster: string) => {
    setSelected((prev) => (prev.includes(cluster) ? prev.filter((item) => item !== cluster) : [...prev, cluster]));
  };

  const handleCreate = () => {
    const clean = normalizeClusterName(draft);
    if (!clean) return;
    onCreateCluster(clean);
    setAvailable((prev) => normalizeClusters([...prev, clean]).sort((a, b) => a.localeCompare(b)));
    setSelected((prev) => normalizeClusters([...prev, clean]));
    setDraft('');
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('programCluster.sheetTitle', { name: programName })}>
      <View style={styles.createRow}>
        <View style={styles.inputWrap}>
          <TextField
            label={t('programCluster.createLabel')}
            value={draft}
            onChangeText={setDraft}
            placeholder={t('programCluster.createPlaceholder')}
            maxLength={CLUSTER_MAX}
          />
        </View>
        <ActionButton icon="add" label={t('programCluster.createAction')} secondary onPress={handleCreate} />
      </View>

      {available.length > 0 ? (
        <View style={styles.group}>
          <Label>{t('programCluster.label')}</Label>
          <View style={styles.chips}>
            {available.map((cluster) => (
              <Chip
                key={cluster}
                icon={selected.includes(cluster) ? 'checkmark' : undefined}
                label={cluster}
                selected={selected.includes(cluster)}
                onPress={() => toggle(cluster)}
              />
            ))}
          </View>
        </View>
      ) : (
        <Body>{t('programCluster.manageEmpty')}</Body>
      )}

      <View style={styles.actions}>
        <ActionButton icon="checkmark" label={t('programCategory.save')} onPress={() => onSave(normalizeClusters(selected))} />
        <ActionButton label={t('common.cancel')} secondary onPress={onClose} />
      </View>
    </Sheet>
  );
}

const baseStyles = StyleSheet.create({
  createRow: { gap: 8 },
  inputWrap: { flex: 1 },
  group: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { gap: 8, marginTop: 4 },
});
