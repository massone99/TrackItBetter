import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';
import { Chip, Label } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { MOVEMENT_GROUPS, MOVEMENT_TAG_SECTIONS, type MovementGroupId } from './movementCatalog';

export function movementTagLabel(tag: string, translate: (key: string, options: { defaultValue: string }) => string): string {
  const key = tag.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return translate(`movement.tags.${key}`, { defaultValue: tag });
}

/** How many matching movement tags are listed while searching. */
const TAG_RESULTS = 12;

/**
 * Movement group and tag. Tags are grouped by joint or region: a row of region chips, and the tags of
 * the open region below it. Searching looks across all regions.
 */
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
  const [chosenSection, setChosenSection] = useState<string | null>(null);
  const needle = query.trim().toLocaleLowerCase();
  const matches = needle
    ? MOVEMENT_TAG_SECTIONS.flatMap((section) => section.tags)
      .filter((tag) => tag !== movementTag && movementTagLabel(tag, t).toLocaleLowerCase().includes(needle))
      .slice(0, TAG_RESULTS)
    : [];
  // Until a region is tapped, the one holding the selected tag is open (or the first one).
  const selectedSection = MOVEMENT_TAG_SECTIONS.find((section) => (section.tags as readonly string[]).includes(movementTag ?? ''))?.id;
  const openId = chosenSection ?? selectedSection ?? MOVEMENT_TAG_SECTIONS[0].id;
  const open = MOVEMENT_TAG_SECTIONS.find((section) => section.id === openId) ?? MOVEMENT_TAG_SECTIONS[0];
  const pick = (tag: string) => { onTagChange(tag); setQuery(''); };

  return (
    <>
      <View style={styles.field}>
        <Label>{t('movement.groupTitle')}</Label>
        <View style={styles.choices}>
          <Chip label={t('movement.none')} selected={movementGroup === null} onPress={() => onGroupChange(null)} />
          {MOVEMENT_GROUPS.map(({ id }) => (
            <Chip key={id} label={t(`movement.groups.${id}`)} selected={movementGroup === id} onPress={() => onGroupChange(id)} />
          ))}
        </View>
      </View>
      <View style={styles.field}>
        <Label>{t('movement.tagTitle')}</Label>
        <View style={styles.choices}>
          {movementTag ? (
            <Chip label={movementTagLabel(movementTag, t)} icon="close" selected onPress={() => onTagChange(null)} />
          ) : (
            <Chip label={t('movement.none')} selected />
          )}
        </View>
        <TextInput
          accessibilityLabel={t('movement.searchTags')}
          value={query}
          onChangeText={setQuery}
          placeholder={t('movement.searchTags')}
          placeholderTextColor={palette.textMuted}
          style={[styles.search, { backgroundColor: palette.surfaceMuted, borderColor: palette.border, color: palette.text }]}
        />
        {needle ? (
          <View style={styles.choices}>
            {matches.map((tag) => <Chip key={tag} label={movementTagLabel(tag, t)} onPress={() => pick(tag)} />)}
          </View>
        ) : (
          <>
            <View style={styles.choices}>
              {MOVEMENT_TAG_SECTIONS.map((section) => (
                <Chip
                  key={section.id}
                  label={t(`movement.sections.${section.id}`)}
                  selected={section.id === open.id}
                  onPress={() => setChosenSection(section.id)}
                />
              ))}
            </View>
            <View style={[styles.tags, { borderColor: palette.border, backgroundColor: palette.surfaceMuted }]}>
              {open.tags.filter((tag) => tag !== movementTag).map((tag) => <Chip key={tag} label={movementTagLabel(tag, t)} onPress={() => pick(tag)} />)}
            </View>
          </>
        )}
      </View>
    </>
  );
}

const baseStyles = StyleSheet.create({
  field: { gap: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, borderWidth: 1, borderRadius: 14, padding: 10 },
  search: { minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
});
