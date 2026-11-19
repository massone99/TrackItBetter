import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AUTHOR_MAX, CATEGORY_MAX, normalizeField } from '../../domain/userProgram';
import { ActionButton, Body, IconButton, Sheet, Text, TextField } from '../../shared/components/ui';
import { useInk } from '../../shared/theme/ink';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import type { ProgramMetaKind } from './ProgramMetaField';

const PREFIX: Record<ProgramMetaKind, 'programCategory' | 'programAuthor'> = {
  category: 'programCategory',
  author: 'programAuthor',
};

const MAX_LENGTH: Record<ProgramMetaKind, number> = {
  category: CATEGORY_MAX,
  author: AUTHOR_MAX,
};

/** Sheet to rename or remove existing program categories or authors across all programs. */
export function ManageCategoriesSheet({ kind = 'category', visible, categories, counts, onRename, onRemove, onClose }: {
  kind?: ProgramMetaKind;
  visible: boolean;
  categories: readonly string[];
  counts: ReadonlyMap<string, number>;
  onRename: (from: string, to: string) => void;
  onRemove: (value: string) => void;
  onClose: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const ink = useInk();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const prefix = PREFIX[kind];

  const startRename = (item: string) => {
    setEditing(item);
    setDraft(item);
  };

  const commitRename = () => {
    if (!editing) return;
    const next = normalizeField(draft, MAX_LENGTH[kind]);
    if (next && next !== editing) onRename(editing, next);
    setEditing(null);
    setDraft('');
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t(`${prefix}.manageTitle`)}>
      {categories.length === 0 ? (
        <Body>{t(`${prefix}.manageEmpty`)}</Body>
      ) : (
        <View style={styles.list}>
          {categories.map((item) => (
            <View key={item} style={[styles.row, { borderTopColor: ink }]}>
              {editing === item ? (
                <View style={styles.editBlock}>
                  <TextField
                    label={t('programCategory.rename')}
                    value={draft}
                    onChangeText={setDraft}
                    maxLength={MAX_LENGTH[kind]}
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
                  <IconButton icon="create-outline" label={`${t('programCategory.rename')} ${item}`} size={48} onPress={() => startRename(item)} />
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
  list: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  copy: { flex: 1, minWidth: 140, gap: 2 },
  name: { fontFamily: fonts.semibold, fontSize: 16 },
  count: { fontFamily: fonts.mono, fontSize: 12 },
  editBlock: { flex: 1, gap: 8, paddingVertical: 4 },
  editActions: { gap: 8 },
});
