import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Icon, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';

/** Running time since the workout started, ticking every second until the screen closes. */
export function WorkoutStopwatch({ startedAt, color, iconColor, size = 28, bare = false }: { startedAt: Date; color?: string; iconColor?: string; size?: number; /** Only the figure, in the mono face, left-aligned and without the icon. */ bare?: boolean }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const total = Math.max(0, Math.floor((now - startedAt.getTime()) / 1000));
  const hours = Math.floor(total / 3600);
  const text = `${hours > 0 ? `${hours}:` : ''}${String(Math.floor((total % 3600) / 60)).padStart(hours > 0 ? 2 : 1, '0')}:${String(total % 60).padStart(2, '0')}`;
  return (
    <View style={[styles.row, bare && styles.bare]} accessible accessibilityRole="timer" accessibilityLabel={`${t('workout.stopwatch')} ${text}`}>
      {bare ? null : <Icon name="timer-outline" size={Math.round(size * 0.8)} color={iconColor ?? palette.accentStrong} />}
      <Text style={[styles.text, bare && styles.mono, { color: color ?? palette.text, fontSize: size }]}>{text}</Text>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48 },
  bare: { justifyContent: 'flex-start', minHeight: 0 },
  text: { fontFamily: fonts.display, fontVariant: ['tabular-nums'] },
  mono: { fontFamily: fonts.monoBold },
});
