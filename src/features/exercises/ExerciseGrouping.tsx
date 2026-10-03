import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { create } from 'zustand';
import { Body, Chip, Label, SectionTitle } from '../../shared/components/ui';
import { readPreference, writePreference } from '../../shared/settings/preferences';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { movementTagLabel } from './ClassificationChoices';
import {
  DEFAULT_EXERCISE_GROUPING, GROUPING_DIMENSIONS, UNCLASSIFIED_EXERCISE_GROUP,
  type ExerciseGroupKey, type ExerciseGrouping, type ExerciseGroupingDimension,
} from './groupExercises';

const KEY = 'library.grouping';

function readGrouping(): ExerciseGrouping {
  try {
    const parsed: unknown = JSON.parse(readPreference(KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return DEFAULT_EXERCISE_GROUPING;
    const stored = parsed as Partial<ExerciseGrouping>;
    return Object.fromEntries(GROUPING_DIMENSIONS.map((dimension) => [dimension,
      typeof stored[dimension] === 'boolean' ? stored[dimension] : DEFAULT_EXERCISE_GROUPING[dimension],
    ])) as ExerciseGrouping;
  } catch {
    return DEFAULT_EXERCISE_GROUPING;
  }
}

/** One remembered choice shared by the library and every exercise picker. */
export const useExerciseGrouping = create<{
  grouping: ExerciseGrouping;
  toggle: (dimension: ExerciseGroupingDimension) => void;
}>((set, get) => ({
  grouping: readGrouping(),
  toggle: (dimension) => {
    const current = get().grouping;
    const next = { ...current, [dimension]: !current[dimension] };
    set({ grouping: next });
    writePreference(KEY, JSON.stringify(next));
  },
}));

export function ExerciseGroupingControls() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { grouping, toggle } = useExerciseGrouping();
  return <View style={styles.controls}>
    <Label>{t('exerciseGrouping.title')}</Label>
    <View style={styles.choices}>
      {GROUPING_DIMENSIONS.map((dimension) => <Chip
        key={dimension}
        label={t(`exerciseGrouping.dimensions.${dimension}`)}
        accessibilityLabel={`${t('exerciseGrouping.title')}: ${t(`exerciseGrouping.dimensions.${dimension}`)}`}
        icon={grouping[dimension] ? 'checkmark' : undefined}
        selected={grouping[dimension]}
        onPress={() => toggle(dimension)}
      />)}
    </View>
    <Body style={styles.hint}>{t(grouping.tag ? 'exerciseGrouping.tagsHint' : 'exerciseGrouping.hint')}</Body>
  </View>;
}

export function ExerciseGroupingHeader({ path, count }: { path: readonly ExerciseGroupKey[]; count: number }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  if (!path.length) return null;
  const labels = path.map(({ dimension, value }) => {
    if (value === UNCLASSIFIED_EXERCISE_GROUP) return t(dimension === 'tag' ? 'exerciseGrouping.untagged' : 'movement.other');
    if (dimension === 'tag') return movementTagLabel(value, t);
    return t(dimension === 'category' ? `library.category.${value}` : `movement.groups.${value}`, { defaultValue: value });
  });
  return <View style={styles.header}>
    {labels.length > 1 ? <Label>{labels.slice(0, -1).join(' · ')}</Label> : null}
    <SectionTitle title={`${labels[labels.length - 1]} · ${count}`} />
  </View>;
}

const baseStyles = StyleSheet.create({
  controls: { gap: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  header: { gap: 4 },
  hint: { fontSize: 13, lineHeight: 18 },
});
