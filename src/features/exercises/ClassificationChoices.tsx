import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';
import { Body, Chip, Label } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { MOVEMENT_GROUPS, MOVEMENT_TAGS, type MovementGroupId } from './movementCatalog';

export function movementTagLabel(tag: string, translate: (key: string, options: { defaultValue: string }) => string): string {
  const key = tag.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return translate(`movement.tags.${key}`, { defaultValue: tag });
}

export function ClassificationChoices({ movementTag, movementGroup, onTagChange, onGroupChange }: {
  movementTag: string | null;
  movementGroup: MovementGroupId | null;
  onTagChange: (tag: string | null) => void;
  onGroupChange: (group: MovementGroupId | null) => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const tags = MOVEMENT_TAGS.filter((tag) => movementTagLabel(tag, t).toLocaleLowerCase().includes(query.toLocaleLowerCase()));

  return (
    <>
      <View style={styles.field}>
        <Label>{t('movement.groupTitle')}</Label>
        <Body>{t('movement.groupHint')}</Body>
        <View style={styles.choices}>
          <Chip label={t('movement.none')} selected={movementGroup === null} onPress={() => onGroupChange(null)} />
          {MOVEMENT_GROUPS.map(({ id }) => (
            <Chip key={id} label={t(`movement.groups.${id}`)} selected={movementGroup === id} onPress={() => onGroupChange(id)} />
          ))}
        </View>
      </View>
      <View style={styles.field}>
        <Label>{t('movement.tagTitle')}</Label>
        <Body>{t('movement.tagHint')}</Body>
        <TextInput
          accessibilityLabel={t('movement.searchTags')}
          value={query}
          onChangeText={setQuery}
          placeholder={t('movement.searchTags')}
          placeholderTextColor={palette.textMuted}
          style={[styles.search, { backgroundColor: palette.surfaceMuted, borderColor: palette.border, color: palette.text }]}
        />
        <View style={styles.choices}>
          <Chip label={t('movement.none')} selected={movementTag === null} onPress={() => onTagChange(null)} />
          {tags.map((tag) => (
            <Chip key={tag} label={movementTagLabel(tag, t)} selected={movementTag === tag} onPress={() => onTagChange(tag)} />
          ))}
        </View>
      </View>
    </>
  );
}

const baseStyles = StyleSheet.create({
  field: { gap: 9 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  search: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 15 },
});
