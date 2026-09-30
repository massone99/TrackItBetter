import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ActionButton, Body, IconButton, SegmentedControl, Sheet, Stepper, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { ExercisePicker } from '../exercises/ExercisePicker';
import { listExercises } from '../exercises/repository';
import { moveItem } from '../../domain/userProgram';
import { TREND_LIMIT_MAX, type TrendChoice } from './trendChoice';

/**
 * Chooses the exercise trends on the Progress tab: automatic (most recent) or a hand-picked,
 * ordered list, and how many to show. Every change is applied at once.
 */
export function TrendSettings({ visible, choice, onChange, onClose }: { visible: boolean; choice: TrendChoice; onChange: (next: TrendChoice) => void; onClose: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [names, setNames] = useState<Map<string, string>>(new Map());
  // The picker is a separate modal: the sheet steps aside while it is open, then comes back.
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!visible && !picking) return;
    void listExercises().then((rows) => setNames(new Map(rows.map((row) => [row.id, row.name])))).catch(() => undefined);
  }, [visible, picking]);

  const ids = choice.exerciseIds ?? [];
  const chosen = choice.exerciseIds !== null;
  const setIds = (next: string[]) => onChange({ ...choice, exerciseIds: next });

  return (
    <>
      <Sheet visible={visible && !picking} onClose={onClose} title={t('trendSettings.title')} body={t('trendSettings.body')}>
        <SegmentedControl<'auto' | 'chosen'>
          value={chosen ? 'chosen' : 'auto'}
          onChange={(mode) => onChange({ ...choice, exerciseIds: mode === 'auto' ? null : ids })}
          options={[{ value: 'auto', label: t('trendSettings.auto') }, { value: 'chosen', label: t('trendSettings.chosen') }]}
        />
        {chosen ? (
          <View style={[styles.list, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            {ids.length === 0 ? <Body style={styles.empty}>{t('trendSettings.empty')}</Body> : null}
            {ids.map((id, index) => (
              <View key={id} style={[styles.row, index > 0 && { borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[styles.position, { color: index < choice.limit ? palette.accentStrong : palette.textMuted }]}>{index + 1}</Text>
                <Text numberOfLines={1} style={[styles.name, { color: index < choice.limit ? palette.text : palette.textMuted }]}>{names.get(id) ?? t('userProgram.exerciseMissing')}</Text>
                <IconButton icon="arrow-up" label={t('trendSettings.up', { name: names.get(id) ?? '' })} tone="plain" size={40} disabled={index === 0} onPress={() => setIds(moveItem(ids, index, -1))} />
                <IconButton icon="arrow-down" label={t('trendSettings.down', { name: names.get(id) ?? '' })} tone="plain" size={40} disabled={index === ids.length - 1} onPress={() => setIds(moveItem(ids, index, 1))} />
                <IconButton icon="close" label={t('trendSettings.remove', { name: names.get(id) ?? '' })} tone="plain" size={40} onPress={() => setIds(ids.filter((item) => item !== id))} />
              </View>
            ))}
          </View>
        ) : <Body>{t('trendSettings.autoBody')}</Body>}
        {chosen ? <ActionButton icon="add" label={t('trendSettings.add')} secondary onPress={() => setPicking(true)} /> : null}
        <Stepper
          layout="row"
          label={t('trendSettings.limit')}
          value={choice.limit}
          min={1}
          max={TREND_LIMIT_MAX}
          presets={[3, 5, 8, 12]}
          onChange={(limit) => onChange({ ...choice, limit })}
        />
        {chosen && ids.length > choice.limit ? <Body>{t('trendSettings.overLimit', { count: choice.limit })}</Body> : null}
        <ActionButton label={t('logger.done')} onPress={onClose} />
      </Sheet>
      <ExercisePicker
        visible={picking}
        title={t('trendSettings.add')}
        include={(item) => !ids.includes(item.id)}
        onChoose={(item) => { setIds([...ids, item.id]); setPicking(false); }}
        onClose={() => setPicking(false)}
      />
    </>
  );
}

const baseStyles = StyleSheet.create({
  list: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  empty: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 14, paddingRight: 4, minHeight: 52 },
  position: { width: 22, fontFamily: fonts.display, fontSize: 18, fontVariant: ['tabular-nums'] },
  name: { flex: 1, fontFamily: fonts.semibold, fontSize: 15 },
});
