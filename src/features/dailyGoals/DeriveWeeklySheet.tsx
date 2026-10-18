import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { deriveWeeklyGoals, type DailyGoal } from '../../domain/dailyGoals';
import { ActionButton, Body, Label, Sheet, Stepper, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { fonts } from '../../shared/theme/typography';
import { goalAmount, goalKeyLabel } from './labels';

/**
 * Makes weekly goals from the daily ones: each daily total times the days of the week it is done.
 * Shows what will be added before it is, and leaves goals already there as they are.
 */
export function DeriveWeeklySheet({ visible, daily, weekly, onDerive, onClose }: {
  visible: boolean;
  daily: readonly DailyGoal[];
  weekly: readonly DailyGoal[];
  onDerive: (days: number) => void;
  onClose: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [days, setDays] = useState(7);
  const plan = deriveWeeklyGoals(daily, weekly, days, () => 'preview');
  const unit = (goal: DailyGoal) => (goal.measure === 'reps' ? ` ${t('dailyGoals.repsUnit')}` : '');
  return (
    <Sheet visible={visible} onClose={onClose} title={t('weeklyGoals.deriveTitle')}>
      <Body>{t('weeklyGoals.deriveBody')}</Body>
      {daily.length === 0 ? <Body style={{ color: palette.warning }}>{t('weeklyGoals.deriveNoDaily')}</Body> : (
        <>
          <Stepper label={t('weeklyGoals.deriveDays')} layout="row" value={days} display={String(days)} step={1} min={1} max={7} onChange={(value) => setDays(Math.min(7, Math.max(1, Math.round(value))))} />
          <Label>{t('weeklyGoals.deriveAdds', { count: plan.add.length })}</Label>
          <View style={styles.list}>
            {plan.add.map((goal, index) => (
              <View key={`${goal.scope}:${goal.key}:${goal.measure}:${index}`} style={[styles.row, { borderColor: palette.border }]}>
                <Text style={[styles.name, { color: palette.text }]}>{goalKeyLabel(goal, t)}</Text>
                <Text style={[styles.amount, { color: palette.accentStrong }]}>{`${goalAmount(goal.measure, goal.target)}${unit(goal)}`}</Text>
              </View>
            ))}
          </View>
          {plan.existing > 0 ? <Body>{t('weeklyGoals.deriveExisting', { count: plan.existing })}</Body> : null}
          {plan.dropped > 0 ? <Body style={{ color: palette.warning }}>{t('weeklyGoals.deriveDropped', { count: plan.dropped })}</Body> : null}
          <ActionButton icon="checkmark" label={plan.add.length === 0 ? t('weeklyGoals.deriveNothing') : t('weeklyGoals.deriveAction', { count: plan.add.length })} disabled={plan.add.length === 0} onPress={() => onDerive(days)} />
        </>
      )}
    </Sheet>
  );
}

const baseStyles = StyleSheet.create({
  list: { gap: 6 },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  name: { flex: 1, fontSize: 16, fontFamily: fonts.semibold },
  amount: { fontSize: 18, fontFamily: fonts.display },
});
