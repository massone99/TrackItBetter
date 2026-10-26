import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';
import { targetMax, type DailyGoal, type DailyGoalMeasure, type DailyGoalScope, type GoalPeriod } from '../../domain/dailyGoals';
import { TAG_ROWS, tagRowsFor, tagRowsToChange, type GoalChange, type GoalDraft, type TagRow, type TagRowKey, type TagRows } from '../../domain/tagGoals';
import { useGoalT } from './period';
import { ActionButton, Body, Chip, Label, SegmentedControl, Sheet, Stepper, SwitchRow } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { MAX_FONT_SCALE } from '../../shared/theme/scale';
import { EXERCISE_CATEGORIES } from '../exercises/categories';
import { movementTagLabel } from '../exercises/ClassificationChoices';
import { MOVEMENT_GROUPS, MOVEMENT_TAG_SECTIONS } from '../exercises/movementCatalog';
import { goalAmount, goalKeyLabel } from './labels';
import { GOAL_STEPS } from './DailyGoalViews';
import { radii } from '../../shared/theme/tokens';

export type { GoalDraft } from '../../domain/tagGoals';

const DEFAULTS: Record<GoalPeriod, Record<DailyGoalMeasure, number>> = { day: { minutes: 60, reps: 30 }, week: { minutes: 1800, reps: 150 } };
const PRESETS: Record<GoalPeriod, Record<DailyGoalMeasure, number[]>> = {
  day: { minutes: [30, 60, 120, 300], reps: [10, 20, 30, 50] },
  week: { minutes: [600, 1800, 3600, 7200], reps: [50, 100, 200, 300] },
};
const STEPS: Record<DailyGoalMeasure, number> = GOAL_STEPS;
const TAG_RESULTS = 12;

/**
 * Adds or edits goals: what they count (category, movement group or tag), in minutes or reps, and the
 * total. A movement tag carries up to three goals at once (total, active, passive mobility), each with
 * its own measure and target. The sheet is keyed by the goal it edits, so it starts from that goal each time.
 */
export function DailyGoalSheet({ period = 'day', visible, initial, goals = [], onSave, onRemove, onClose }: {
  period?: GoalPeriod;
  visible: boolean;
  initial: GoalDraft | null;
  /** Every goal of the period: a tag's sheet starts from the ones that already count that tag. */
  goals?: readonly DailyGoal[];
  onSave: (change: GoalChange) => void;
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
  const [rows, setRows] = useState<TagRows>(() => tagRowsFor(goals, initial?.scope === 'tag' ? initial.key : '', DEFAULTS[period]));
  // The tag the sheet opened on: choosing another one moves its goals there.
  const [from] = useState(initial?.scope === 'tag' ? initial.key : undefined);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<string | null>(null);

  const changeScope = (next: DailyGoalScope) => { setScope(next); setKey(null); setQuery(''); };
  const changeMeasure = (next: DailyGoalMeasure) => { setMeasure(next); setTarget(DEFAULTS[period][next]); };
  const pickTag = (tag: string) => { setKey(tag); setRows(tagRowsFor(goals, tag, DEFAULTS[period])); };
  const setRow = (name: TagRowKey, next: Partial<TagRow>) => setRows((current) => ({ ...current, [name]: { ...current[name], ...next } }));
  const rowsOn = TAG_ROWS.filter((name) => rows[name].on).length;

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
                {matches.map((tag) => <Chip key={tag} label={movementTagLabel(tag, t)} selected={key === tag} onPress={() => pickTag(tag)} />)}
              </View>
            ) : (
              <>
                <View style={styles.chips}>
                  {MOVEMENT_TAG_SECTIONS.map((item) => <Chip key={item.id} label={t(`movement.sections.${item.id}`)} selected={item.id === open.id} onPress={() => setSection(item.id)} />)}
                </View>
                <View style={[styles.tags, { borderColor: palette.border, backgroundColor: palette.surfaceMuted }]}>
                  {open.tags.map((tag) => <Chip key={tag} label={movementTagLabel(tag, t)} selected={key === tag} onPress={() => pickTag(tag)} />)}
                </View>
              </>
            )}
          </>
        )}
      </View>
      {scope === 'tag' ? (
        <View style={styles.field}>
          <Label>{t('dailyGoals.tagRowsTitle')}</Label>
          <Body>{t('dailyGoals.tagRowsHint')}</Body>
          {TAG_ROWS.map((name) => (
            <TagRowCard key={name} name={name} row={rows[name]} period={period} onChange={(next) => setRow(name, next)} />
          ))}
        </View>
      ) : (
        <>
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
        </>
      )}
      <ActionButton
        icon="checkmark"
        label={key === null ? t('dailyGoals.pickFirst')
          : scope === 'tag' ? (rowsOn === 0 ? t('dailyGoals.pickRows') : t('dailyGoals.saveTag', { name: goalKeyLabel({ scope, key }, t), count: rowsOn }))
            : t(initial?.id ? 'dailyGoals.saveSummary' : 'dailyGoals.addSummary', { name: goalKeyLabel({ scope, key }, t), amount: `${goalAmount(measure, target)}${measure === 'reps' ? ` ${t('dailyGoals.repsUnit')}` : ''}` })}
        disabled={key === null || (scope === 'tag' && rowsOn === 0)}
        onPress={() => {
          if (key === null) return;
          if (scope === 'tag') onSave(tagRowsToChange(key, rows, goals, from));
          else onSave({ drafts: [{ id: initial?.id, scope, key, measure, target }], removeIds: [] });
        }}
      />
      {onRemove ? <ActionButton icon="trash-outline" variant="danger" label={t('dailyGoals.remove')} onPress={onRemove} /> : null}
    </Sheet>
  );
}

/** One of the goals of a tag: an on/off switch, and when on its measure and target. */
function TagRowCard({ name, row, period, onChange }: { name: TagRowKey; row: TagRow; period: GoalPeriod; onChange: (next: Partial<TagRow>) => void }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const tg = useGoalT(period);
  const title = name === 'all' ? t('dailyGoals.rowAll') : t(`customExercise.mobilityMode.${name}`);
  const subtitle = row.on ? `${goalAmount(row.measure, row.target)}${row.measure === 'reps' ? ` ${t('dailyGoals.repsUnit')}` : ''}` : t(name === 'all' ? 'dailyGoals.rowAllHint' : 'dailyGoals.rowModeHint');
  const changeMeasure = (next: DailyGoalMeasure) => onChange({ measure: next, target: DEFAULTS[period][next] });
  return (
    <View style={[styles.rowCard, { borderColor: row.on ? palette.accentStrong : palette.border, backgroundColor: palette.surface }]}>
      <SwitchRow title={title} subtitle={subtitle} value={row.on} onChange={(on) => onChange({ on })} />
      {row.on ? (
        <View style={styles.rowBody}>
          <SegmentedControl
            value={row.measure}
            options={[{ value: 'minutes', label: t('dailyGoals.measure.minutes') }, { value: 'reps', label: t('dailyGoals.measure.reps') }]}
            onChange={changeMeasure}
          />
          <Stepper
            label={tg('totalTitle')}
            layout="row"
            value={row.target}
            display={goalAmount(row.measure, row.target)}
            step={STEPS[row.measure]}
            min={STEPS[row.measure]}
            max={targetMax(period, row.measure)}
            editable
            clock={row.measure === 'minutes'}
            presets={PRESETS[period][row.measure]}
            presetLabel={(value) => goalAmount(row.measure, value)}
            onChange={(value) => onChange({ target: Math.max(1, Math.round(value)) })}
          />
        </View>
      ) : null}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  rowCard: { borderWidth: 1, borderRadius: radii.control, padding: 12, gap: 12 },
  rowBody: { gap: 12 },
  field: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, borderWidth: 1, borderRadius: radii.control, padding: 10 },
  search: { minHeight: 48, borderWidth: 1, borderRadius: radii.control, paddingHorizontal: 12, fontSize: 15 },
});
