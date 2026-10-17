import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';
import { targetMax, type DailyGoal, type DailyGoalMeasure, type DailyGoalScope, type GoalPeriod } from '../../domain/dailyGoals';
import { useGoalT } from './period';
import { ActionButton, Body, Chip, Label, SegmentedControl, Sheet, Stepper } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { MAX_FONT_SCALE } from '../../shared/theme/scale';
import { EXERCISE_CATEGORIES } from '../exercises/categories';
import { movementTagLabel } from '../exercises/ClassificationChoices';
import { MOVEMENT_GROUPS, MOVEMENT_TAG_SECTIONS } from '../exercises/movementCatalog';
import { goalAmount, goalKeyLabel } from './labels';
import { GOAL_STEPS } from './DailyGoalViews';

export type GoalDraft = Omit<DailyGoal, 'id'> & { id?: string };

const DEFAULTS: Record<GoalPeriod, Record<DailyGoalMeasure, number>> = { day: { minutes: 60, reps: 30 }, week: { minutes: 1800, reps: 150 } };
const PRESETS: Record<GoalPeriod, Record<DailyGoalMeasure, number[]>> = {
  day: { minutes: [30, 60, 120, 300], reps: [10, 20, 30, 50] },
  week: { minutes: [600, 1800, 3600, 7200], reps: [50, 100, 200, 300] },
};
const STEPS: Record<DailyGoalMeasure, number> = GOAL_STEPS;
const TAG_RESULTS = 12;

/**
 * Adds or edits a daily goal: what it counts (category, movement group or tag), in minutes or reps,
 * and the total. The sheet is keyed by the goal it edits, so it starts from that goal each time.
 */
export function DailyGoalSheet({ period = 'day', visible, initial, onSave, onRemove, onClose }: {
  period?: GoalPeriod;
  visible: boolean;
  initial: GoalDraft | null;
  onSave: (goal: GoalDraft) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const tg = useGoalT(period);
  const { palette } = useTheme();
  const [scope, setScope] = useState<DailyGoalScope>(initial?.scope ?? 'tag');
  const [key, setKey] = useState<string | null>(initial?.key ?? null);
  const [measure, setMeasure] = useState<DailyGoalMeasure>(initial?.measure ?? 'minutes');
  const [target, setTarget] = useState(initial?.target ?? DEFAULTS[period].minutes);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<string | null>(null);

  const changeScope = (next: DailyGoalScope) => { setScope(next); setKey(null); setQuery(''); };
  const changeMeasure = (next: DailyGoalMeasure) => { setMeasure(next); setTarget(DEFAULTS[period][next]); };

  const needle = query.trim().toLocaleLowerCase();
  const allTags = MOVEMENT_TAG_SECTIONS.flatMap((item) => item.tags);
  const matches = needle ? allTags.filter((tag) => movementTagLabel(tag, t).toLocaleLowerCase().includes(needle)).slice(0, TAG_RESULTS) : [];
  const openId = section ?? MOVEMENT_TAG_SECTIONS.find((item) => key !== null && (item.tags as readonly string[]).includes(key))?.id ?? MOVEMENT_TAG_SECTIONS[0].id;
  const open = MOVEMENT_TAG_SECTIONS.find((item) => item.id === openId) ?? MOVEMENT_TAG_SECTIONS[0];

  return (
    <Sheet visible={visible} onClose={onClose} title={t(initial?.id ? 'dailyGoals.editTitle' : 'dailyGoals.newTitle')}>
      <View style={styles.field}>
        <Label>{t('dailyGoals.countBy')}</Label>
        <SegmentedControl
          value={scope}
          options={[
            { value: 'category', label: t('dailyGoals.scope.category') },
            { value: 'group', label: t('dailyGoals.scope.group') },
            { value: 'tag', label: t('dailyGoals.scope.tag') },
          ]}
          onChange={changeScope}
        />
      </View>
      <View style={styles.field}>
        <Label>{t(`dailyGoals.scope.${scope}`)}</Label>
        {scope === 'category' ? (
          <View style={styles.chips}>
            {EXERCISE_CATEGORIES.map((id) => <Chip key={id} label={t(`library.category.${id}`)} selected={key === id} onPress={() => setKey(id)} />)}
          </View>
        ) : scope === 'group' ? (
          <View style={styles.chips}>
            {MOVEMENT_GROUPS.map(({ id }) => <Chip key={id} label={t(`movement.groups.${id}`)} selected={key === id} onPress={() => setKey(id)} />)}
          </View>
        ) : (
          <>
            {key ? <View style={styles.chips}><Chip label={movementTagLabel(key, t)} selected icon="checkmark" /></View> : null}
            <TextInput maxFontSizeMultiplier={MAX_FONT_SCALE}
              accessibilityLabel={t('movement.searchTags')}
              value={query}
              onChangeText={setQuery}
              placeholder={t('movement.searchTags')}
              placeholderTextColor={palette.textMuted}
              style={[styles.search, { backgroundColor: palette.surfaceMuted, borderColor: palette.border, color: palette.text }]}
            />
            {needle ? (
              <View style={styles.chips}>
                {matches.map((tag) => <Chip key={tag} label={movementTagLabel(tag, t)} selected={key === tag} onPress={() => setKey(tag)} />)}
              </View>
            ) : (
              <>
                <View style={styles.chips}>
                  {MOVEMENT_TAG_SECTIONS.map((item) => <Chip key={item.id} label={t(`movement.sections.${item.id}`)} selected={item.id === open.id} onPress={() => setSection(item.id)} />)}
                </View>
                <View style={[styles.tags, { borderColor: palette.border, backgroundColor: palette.surfaceMuted }]}>
                  {open.tags.map((tag) => <Chip key={tag} label={movementTagLabel(tag, t)} selected={key === tag} onPress={() => setKey(tag)} />)}
                </View>
              </>
            )}
          </>
        )}
      </View>
      <View style={styles.field}>
        <Label>{t('dailyGoals.measureTitle')}</Label>
        <SegmentedControl
          value={measure}
          options={[{ value: 'minutes', label: t('dailyGoals.measure.minutes') }, { value: 'reps', label: t('dailyGoals.measure.reps') }]}
          onChange={changeMeasure}
        />
        <Body>{t(measure === 'minutes' ? 'dailyGoals.minutesHint' : 'dailyGoals.repsHint')}</Body>
      </View>
      <Stepper
        label={tg('totalTitle')}
        layout="row"
        value={target}
        display={goalAmount(measure, target)}
        step={STEPS[measure]}
        min={STEPS[measure]}
        max={targetMax(period, measure)}
        editable
        clock={measure === 'minutes'}
        presets={PRESETS[period][measure]}
        presetLabel={(value) => goalAmount(measure, value)}
        onChange={(value) => setTarget(Math.max(1, Math.round(value)))}
      />
      <ActionButton
        icon="checkmark"
        label={key === null ? t('dailyGoals.pickFirst') : t(initial?.id ? 'dailyGoals.saveSummary' : 'dailyGoals.addSummary', { name: goalKeyLabel({ scope, key }, t), amount: `${goalAmount(measure, target)}${measure === 'reps' ? ` ${t('dailyGoals.repsUnit')}` : ''}` })}
        disabled={key === null}
        onPress={() => { if (key !== null) onSave({ id: initial?.id, scope, key, measure, target }); }}
      />
      {onRemove ? <ActionButton icon="trash-outline" variant="danger" label={t('dailyGoals.remove')} onPress={onRemove} /> : null}
    </Sheet>
  );
}

const baseStyles = StyleSheet.create({
  field: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, borderWidth: 1, borderRadius: 14, padding: 10 },
  search: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
});
