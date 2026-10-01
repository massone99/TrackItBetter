import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { Exercise } from '../../db/schema';
import { Chip, EmptyState, Icon, Label, ListGroup, ListRow, SectionTitle } from '../../shared/components/ui';
import { iconForCategory } from '../../shared/components/categoryIcons';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { fonts } from '../../shared/theme/typography';
import { EXERCISE_CATEGORIES } from './categories';
import { listExercises, setExerciseFavourite } from './repository';
import { MOVEMENT_GROUPS, MOVEMENT_GROUP_IDS } from './movementCatalog';

const categories = ['all', ...EXERCISE_CATEGORIES] as const;
type CategoryFilter = (typeof categories)[number];

/** Searchable exercise library with category and favourite filters. */
export function LibraryView() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [items, setItems] = useState<Exercise[]>([]);
  const [loadedFilter, setLoadedFilter] = useState<string | null>(null);
  const filterKey = JSON.stringify([query, category, favouritesOnly]);

  useFocusEffect(useCallback(() => {
    let current = true;
    setLoadedFilter(null);
    void listExercises({ query, category: category === 'all' ? undefined : category, favouritesOnly })
      .then((results) => {
        if (current) {
          setItems(results);
          setLoadedFilter(filterKey);
        }
    });
    return () => { current = false; };
  }, [query, category, favouritesOnly, filterKey]));

  const toggleFavourite = async (exercise: Exercise) => {
    await setExerciseFavourite(exercise.id, !exercise.favourite);
    const results = await listExercises({ query, category: category === 'all' ? undefined : category, favouritesOnly });
    setItems(results);
  };

  const exerciseRow = (exercise: Exercise) => (
    <ListRow
      key={exercise.id}
      icon={iconForCategory(exercise.category)}
      title={exercise.name}
      subtitle={[t(`library.category.${exercise.category}`), t(`metric.${exercise.metric}`), exercise.level ? t('progression.level', { number: exercise.level }) : null].filter(Boolean).join(' · ')}
      onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } })}
      trailing={
        <Pressable accessibilityRole="button" accessibilityLabel={exercise.favourite ? t('library.removeFavourite') : t('library.addFavourite')} onPress={() => void toggleFavourite(exercise)} hitSlop={12} style={styles.star}>
          <Icon name={exercise.favourite ? 'star' : 'star-outline'} size={20} color={exercise.favourite ? palette.record : palette.textMuted} />
        </Pressable>
      }
    />
  );
  const ungrouped = items.filter((exercise) => !exercise.movementGroup || !(MOVEMENT_GROUP_IDS as readonly string[]).includes(exercise.movementGroup));

  return (
    <>
      <View style={[styles.searchBox, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Icon name="search" size={18} color={palette.textMuted} />
        <TextInput
          accessibilityLabel={t('library.search')}
          value={query}
          onChangeText={setQuery}
          placeholder={t('library.search')}
          placeholderTextColor={palette.textMuted}
          style={[styles.search, { color: palette.text }]}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories} style={styles.chipRow}>
        <Chip icon={favouritesOnly ? 'star' : 'star-outline'} label={t('library.favourites')} selected={favouritesOnly} onPress={() => setFavouritesOnly(!favouritesOnly)} />
        {categories.map((value) => (
          <Chip key={value} label={t(`library.category.${value}`)} selected={value === category} onPress={() => setCategory(value)} />
        ))}
      </ScrollView>
      <Label>{t('library.results', { count: items.length })} · {t('library.offline')}</Label>
      {loadedFilter !== filterKey ? <ActivityIndicator color={palette.accentStrong} /> : items.length === 0 ? (
        <EmptyState icon="search-outline" title={t('library.empty')} body={t('library.emptyBody')} />
      ) : (
        <>
          {MOVEMENT_GROUPS.map(({ id }) => {
            const groupItems = items.filter((exercise) => exercise.movementGroup === id);
            return groupItems.length ? (
              <View key={id} style={styles.group}>
                <SectionTitle title={`${t(`movement.groups.${id}`)} · ${groupItems.length}`} />
                <ListGroup>{groupItems.map(exerciseRow)}</ListGroup>
              </View>
            ) : null;
          })}
          {ungrouped.length ? (
            <View style={styles.group}>
              <SectionTitle title={`${t('movement.other')} · ${ungrouped.length}`} />
              <ListGroup>{ungrouped.map(exerciseRow)}</ListGroup>
            </View>
          ) : null}
        </>
      )}
    </>
  );
}

const baseStyles = StyleSheet.create({
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderWidth: 1, borderRadius: 12, minHeight: 56 },
  search: { flex: 1, minHeight: 48, fontFamily: fonts.body, fontSize: 16, outlineWidth: 0 },
  chipRow: { marginHorizontal: -20 },
  categories: { gap: 8, paddingHorizontal: 20 },
  star: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  group: { gap: 12 },
});
