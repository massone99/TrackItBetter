import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ActionButton, IconButton, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { formatClock } from '../../shared/utils/format';

/**
 * Self-regulated rest after a set under a total goal: a clock counting up from the set, with the
 * ordinary rest countdown one tap away.
 */
export function FreeRestBar({ since, restSec, onStartRest, onClose }: { since: number; restSec: number; onStartRest: () => void; onClose: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = formatClock(Math.max(0, Math.floor((now - since) / 1000)));
  return (
    <View style={[styles.bar, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View accessible accessibilityRole="timer" accessibilityLabel={`${t('totalGoal.freeRest')} ${elapsed}`} style={styles.copy}>
        <Text style={[styles.label, { color: palette.textMuted }]}>{t('totalGoal.freeRest')}</Text>
        <Text style={[styles.value, { color: palette.text }]}>{elapsed}</Text>
      </View>
      <View style={styles.action}><ActionButton icon="timer-outline" label={t('totalGoal.startRest', { time: formatClock(restSec) })} secondary onPress={onStartRest} /></View>
      <IconButton icon="close" label={t('totalGoal.closeFreeRest')} tone="plain" onPress={onClose} />
    </View>
  );
}

const baseStyles = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderRadius: 18, borderWidth: 1, paddingVertical: 8, paddingLeft: 16, paddingRight: 4 },
  copy: { flexGrow: 1, minWidth: 96 },
  label: { fontFamily: fonts.medium, fontSize: 13 },
  value: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, fontVariant: ['tabular-nums'] },
  action: { flexShrink: 1 },
});
