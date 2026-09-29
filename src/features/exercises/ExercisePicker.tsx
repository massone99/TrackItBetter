import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useAppInsets } from '../../shared/layout/useAppInsets';
import { Body, Chip, Heading, Icon, IconButton, ListRow, tapFeedback } from '../../shared/components/ui';
import { KeyboardScroll } from '../../shared/components/keyboard';
import { iconForCategory } from '../../shared/components/categoryIcons';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { listExercises } from './repository';

export type ExerciseChoice = { id: string; name: string; metric: string; category: string; extraCategories: string; level: number | null };

const CATEGORIES = ['push', 'pull', 'legs', 'core', 'skill', 'mobility'] as const;

/** Full-screen exercise search with category filters and an optional "create" entry. */
export function ExercisePicker({ visible, title, subtitle, initialCategory = null, onChoose, onCreate, onClose }: {
  visible: boolean;
  title: string;
  subtitle?: string;
  initialCategory?: string | null;
  onChoose: (choice: ExerciseChoice) => void;
  onCreate?: () => void;
  onClose: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const insets = useAppInsets();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(initialCategory);
  const [choices, setChoices] = useState<ExerciseChoice[]>([]);

  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    void listExercises({ query }).then((items) => {
      if (mounted) setChoices(items.map(({ id, name, metric, category: itemCategory, extraCategories, level }) => ({ id, name, metric, category: itemCategory, extraCategories, level })));
    });
    return () => { mounted = false; };
  }, [visible, query]);

  const filtered = choices.filter((choice) => !category || choice.category === category || choice.extraCategories.includes(`"${category}"`)).slice(0, 80);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.root, { backgroundColor: palette.background, paddingTop: Math.max(insets.top, 14) + 10 }]}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Heading style={styles.title}>{title}</Heading>
            {subtitle ? <Body>{subtitle}</Body> : null}
          </View>
          <IconButton icon="close" label={t('workout.close')} onPress={onClose} />
        </View>
        <View style={[styles.searchBox, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Icon name="search" size={18} color={palette.textMuted} />
          <TextInput
            accessibilityLabel={t('workout.search')}
            placeholder={t('workout.search')}
            placeholderTextColor={palette.textMuted}
            value={query}
            onChangeText={setQuery}
            style={[styles.searchInput, { color: palette.text }]}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chips}>
          <Chip label={t('logger.filterAll')} selected={category === null} onPress={() => setCategory(null)} />
          {CATEGORIES.map((item) => <Chip key={item} label={t(`library.category.${item}`)} selected={category === item} onPress={() => setCategory(item)} />)}
        </ScrollView>
        <KeyboardScroll contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}>
          {onCreate ? <ListRow icon="create-outline" title={t('logger.createExercise')} onPress={onCreate} /> : null}
          {filtered.map((exercise) => (
            <ListRow
              key={exercise.id}
              icon={iconForCategory(exercise.category)}
              title={exercise.name}
              subtitle={[t(`library.category.${exercise.category}`), t(`metric.${exercise.metric}`), exercise.level ? t('progression.level', { number: exercise.level }) : null].filter(Boolean).join(' · ')}
              onPress={() => onChoose(exercise)}
              // The add icon sits beside the row's touch area, so it needs its own press handler.
              trailing={(
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('logger.addNamed', { name: exercise.name })}
                  hitSlop={10}
                  onPress={() => { tapFeedback(); onChoose(exercise); }}
                >
                  <Icon name="add-circle" size={28} color={palette.accentStrong} />
                </Pressable>
              )}
            />
          ))}
        </KeyboardScroll>
      </View>
    </Modal>
  );
}

const baseStyles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20 },
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginTop: 16, paddingHorizontal: 14, borderWidth: 1, borderRadius: 14, minHeight: 50 },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 16, minHeight: 48, outlineWidth: 0 },
  chipScroll: { flexGrow: 0, flexShrink: 0, marginTop: 12 },
  chips: { gap: 8, paddingHorizontal: 20, paddingVertical: 4, alignItems: 'center' },
  list: { paddingHorizontal: 8, paddingTop: 8 },
});
