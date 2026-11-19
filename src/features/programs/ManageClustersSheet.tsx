import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { CLUSTER_MAX, normalizeClusterName } from '../../domain/userProgram';
import { ActionButton, Body, IconButton, Sheet, Text, TextField } from '../../shared/components/ui';
import { useInk } from '../../shared/theme/ink';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';

/** Sheet to create, rename, or delete custom program clusters across all programs. */
export function ManageClustersSheet({ visible, clusters, counts, onCreate, onRename, onRemove, onClose }: {
  visible: boolean;
  clusters: readonly string[];
  counts: ReadonlyMap<string, number>;
  onCreate: (name: string) => void;
  onRename: (from: string, to: string) => void;
  onRemove: (name: string) => void;
  onClose: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const ink = useInk();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const handleCreate = () => {
    const clean = normalizeClusterName(newName);
    if (!clean) return;
    onCreate(clean);
    setNewName('');
  };

  const commitRename = () => {
    if (!editing) return;
    const next = normalizeClusterName(draft);
    if (next && next !== editing) onRename(editing, next);
    setEditing(null);
    setDraft('');
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('programCluster.manageTitle')}>
      <View style={styles.createBlock}>
        <TextField
          label={t('programCluster.createLabel')}
          value={newName}
          onChangeText={setNewName}
          placeholder={t('programCluster.createPlaceholder')}
          maxLength={CLUSTER_MAX}
        />
        <ActionButton icon="add" label={t('programCluster.createAction')} secondary onPress={handleCreate} />
      </View>

      {clusters.length === 0 ? (
        <Body>{t('programCluster.manageEmpty')}</Body>
      ) : (
        <View style={styles.list}>
          {clusters.map((item) => (
            <View key={item} style={[styles.row, { borderTopColor: ink }]}>
              {editing === item ? (
                <View style={styles.editBlock}>
                  <TextField
                    label={t('programCategory.rename')}
                    value={draft}
                    onChangeText={setDraft}
                    maxLength={CLUSTER_MAX}
                    autoFocus
                  />
                  <View style={styles.editActions}>
                    <ActionButton icon="checkmark" label={t('programCategory.save')} onPress={commitRename} />
                    <ActionButton label={t('programCategory.cancel')} secondary onPress={() => setEditing(null)} />
                  </View>
                </View>
              ) : (
                <>
                  <View style={styles.copy}>
                    <Text style={[styles.name, { color: palette.text }]}>{item}</Text>
                    <Text style={[styles.count, { color: palette.textMuted }]}>
                      {t('programCategory.programCount', { count: counts.get(item) ?? 0 })}
                    </Text>
                  </View>
                  <IconButton icon="create-outline" label={`${t('programCategory.rename')} ${item}`} size={48} onPress={() => { setEditing(item); setDraft(item); }} />
                  <IconButton icon="trash-outline" tone="plain" color={palette.warning} label={`${t('programCategory.remove')} ${item}`} size={48} onPress={() => onRemove(item)} />
                </>
              )}
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const baseStyles = StyleSheet.create({
  createBlock: { gap: 8, marginBottom: 4 },
  list: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  copy: { flex: 1, minWidth: 140, gap: 2 },
  name: { fontFamily: fonts.semibold, fontSize: 16 },
  count: { fontFamily: fonts.mono, fontSize: 12 },
  editBlock: { flex: 1, gap: 8, paddingVertical: 4 },
  editActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
