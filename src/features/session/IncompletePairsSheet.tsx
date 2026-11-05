import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActionButton, Icon, Sheet, Tag, Text, tapFeedback } from '../../shared/components/ui';
import { useInk } from '../../shared/theme/ink';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { instrument, spacing } from '../../shared/theme/tokens';
import type { IncompletePair } from './incompletePairs';

/**
 * Why the workout cannot end yet: every one-sided set (left / right) with only one side done, each with a
 * badge per side (done or still to do) and a button that takes you to it.
 */
export function IncompletePairsSheet({ visible, pairs, onClose, onGo }: { visible: boolean; pairs: IncompletePair[]; onClose: () => void; onGo: (pair: IncompletePair) => void }) {
  const { t } = useTranslation();
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const ink = useInk();
  const sideWord = (side: 'left' | 'right') => t(side === 'left' ? 'logger.sideLeft' : 'logger.sideRight');
  return (
    <Sheet visible={visible} onClose={onClose} title={t('logger.pairSheetTitle')} body={t('logger.pairSheetBody')}>
      <View style={styles.list}>
        {pairs.map((pair) => (
          <Pressable
            key={`${pair.entryId}-${pair.setNumber}`}
            accessibilityRole="button"
            accessibilityLabel={`${pair.name}. ${t('logger.pairSheetSet', { number: pair.setNumber, side: pair.missing.map(sideWord).join(', ') })}. ${t('logger.pairGo')}`}
            onPress={() => { tapFeedback(); onGo(pair); }}
            style={({ pressed }) => [styles.row, { borderColor: ink, backgroundColor: pressed ? palette.surfaceMuted : palette.surface }]}
          >
            <View style={styles.rowText}>
              <Text style={[styles.name, { color: palette.text }]}>{pair.name}</Text>
              <Text style={[styles.hint, { color: palette.warning }]}>{t('logger.pairSheetSet', { number: pair.setNumber, side: pair.missing.map(sideWord).join(', ') })}</Text>
            </View>
            <View style={styles.badges}>
              {(['left', 'right'] as const).map((side) => {
                const done = pair.done[side];
                return (
                  <View key={side} style={[styles.badge, done ? { backgroundColor: palette.success, borderColor: palette.success } : { borderColor: palette.warning, borderStyle: 'dashed' }]}>
                    {done ? <Icon name="checkmark" size={14} color={palette.successText} /> : null}
                    <Text style={[styles.badgeText, { color: done ? palette.successText : palette.warning }]}>{side === 'left' ? 'L' : 'R'}</Text>
                  </View>
                );
              })}
            </View>
            <Icon name="chevron-forward" size={18} color={palette.textMuted} />
          </Pressable>
        ))}
      </View>
      <Tag>{t('logger.pairSheetCount', { done: pairs.length })}</Tag>
      <ActionButton icon="arrow-forward" label={t('logger.pairGoFirst')} onPress={() => pairs[0] && onGo(pairs[0])} />
      <ActionButton label={t('logger.keepGoing')} secondary onPress={onClose} />
    </Sheet>
  );
}

const baseStyles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { minHeight: 64, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: instrument.radius, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  rowText: { flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 0, gap: 2 },
  name: { fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 13 },
  badges: { flexDirection: 'row', gap: spacing.xs },
  badge: { minWidth: 40, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, borderWidth: 1, borderRadius: instrument.radius, paddingHorizontal: spacing.xs },
  badgeText: { fontSize: 14, fontWeight: '700' },
});
