import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { listExercises, setExerciseFavourite } from '../../src/features/exercises/repository';
import type { Exercise } from '../../src/db/schema';
import { Chip, EmptyState, Icon, IconButton, Label, ListGroup, ListRow, PageHeading, Screen } from '../../src/shared/components/ui';
import { iconForCategory } from '../../src/shared/components/categoryIcons';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';

const categories = ['all', 'push', 'pull', 'legs', 'core', 'skill', 'mobility', 'cardio'] as const;
type CategoryFilter = (typeof categories)[number];

export default function LibraryScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [items, setItems] = useState<Exercise[]>([]);
  const [loadedFilter, setLoadedFilter] = useState<string | null>(null);
  const filterKey = JSON.stringify([query, category, favouritesOnly]);

  useEffect(() => {
    let current = true;
    void listExercises({ query, category: category === 'all' ? undefined : category, favouritesOnly })
      .then((results) => {
        if (current) {
          setItems(results);
          setLoadedFilter(filterKey);
        }
      });
    return () => { current = false; };
  }, [query, category, favouritesOnly, filterKey]);

  const toggleFavourite = async (exercise: Exercise) => {
    await setExerciseFavourite(exercise.id, !exercise.favourite);
    const results = await listExercises({ query, category: category === 'all' ? undefined : category, favouritesOnly });
    setItems(results);
  };

  return (
    <Screen>
      <PageHeading
        title={t('library.title')}
        subtitle={t('library.subtitle')}
        action={<IconButton icon="add" tone="accent" label={t('library.createCustom')} onPress={() => router.push('/exercise/new')} />}
      />
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
        <ListGroup>
          {items.map((exercise) => (
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
          ))}
        </ListGroup>
      )}
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderWidth: 1, borderRadius: 14, minHeight: 50 },
  search: { flex: 1, minHeight: 48, fontSize: 16, outlineWidth: 0 },
  chipRow: { marginHorizontal: -20 },
  categories: { gap: 8, paddingHorizontal: 20 },
  star: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
});
