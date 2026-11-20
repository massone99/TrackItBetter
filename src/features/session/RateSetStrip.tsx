import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, tapFeedback } from '../../shared/components/ui';
import { useInk } from '../../shared/theme/ink';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, radii, spacing } from '../../shared/theme/tokens';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';

const RPE = [6, 7, 8, 9, 10];
const FORM = [1, 2, 3, 4, 5];

/**
 * Shown above the rest timer: rate the set just done (effort and form) with one tap each, while resting.
 * Optional; "More" opens the set's sheet (ROM, note, bands, video).
 */
export function RateSetStrip({ setLabel, rpe, target, form, showRpe, onRpe, onForm, onMore }: {
  setLabel: string;
  rpe: number | null;
  target: number | null;
  form: number | null;
  showRpe: boolean;
  onRpe: (value: number | null) => void;
  onForm: (value: number | null) => void;
  onMore: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette, largeText } = useTheme();
  const ink = useInk();
  const row = (label: string, values: number[], value: number | null, onChange: (value: number | null) => void, targetValue: number | null = null) => (
    <View style={[styles.row, largeText && styles.rowStacked]}>
      <Text style={[styles.label, { color: palette.textMuted }]}>{label}</Text>
      <View style={[styles.segment, { borderColor: ink }]}>
        {values.map((option, index) => {
          const selected = value === option;
          const isTarget = targetValue === option;
          return (
            <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected }}
              accessibilityLabel={`${label} ${option}${isTarget ? `, ${t('simple.targetMark')}` : ''}`}
              onPress={() => { tapFeedback(); onChange(selected ? null : option); }}
              style={[styles.cell, index > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: palette.border },
                { backgroundColor: selected ? palette.accent : isTarget ? palette.accentSoft : palette.surface },
                isTarget && !selected && { borderBottomWidth: 3, borderBottomColor: palette.accentStrong }]}>
              <Text style={[styles.cellText, { color: selected ? palette.accentText : isTarget ? palette.accentStrong : palette.text }]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
  return (
    <View style={[styles.strip, { backgroundColor: palette.background, borderBottomColor: palette.border }]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: palette.text }]}>{t('simple.rateSet', { set: setLabel })}</Text>
        <Pressable accessibilityRole="button" onPress={() => { tapFeedback(); onMore(); }} style={styles.more}>
          <Text style={[styles.moreText, { color: palette.accentStrong }]}>{t('simple.more')}</Text>
        </Pressable>
      </View>
      {showRpe ? row(t('ledger.rpe'), RPE, rpe, onRpe, target) : null}
      {row(t('ledger.form'), FORM, form, onForm)}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  strip: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm, borderBottomWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  title: { flexShrink: 1, fontFamily: fonts.monoSemibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.7, textTransform: 'uppercase' },
  more: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingLeft: spacing.sm },
  moreText: { fontFamily: fonts.monoSemibold, fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.xs },
  label: { minWidth: 44, fontFamily: fonts.monoSemibold, fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase' },
  segment: { flex: 1, flexDirection: 'row', borderWidth: 1, borderRadius: radii.control, overflow: 'hidden' },
  cell: { flex: 1, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontFamily: fonts.monoBold, fontSize: 15 },
});
