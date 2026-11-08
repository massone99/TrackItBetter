import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, IconButton, Text } from '../../../shared/components/ui';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { fonts } from '../../../shared/theme/typography';
import { useScaledStyles } from '../../../shared/theme/useScaledStyles';

/** One exercise of the workout: name over its prescription in mono. Grip, tap to edit, three dots for the rest. */
export function ExerciseRow({ name, line, hasNote, invalid, selecting, picked, handle, onPress, onMenu, onOpenExercise }: {
  name: string;
  line: string;
  hasNote: boolean;
  invalid: boolean;
  selecting: boolean;
  picked: boolean;
  handle: ReactNode;
  onPress: () => void;
  onMenu: () => void;
  onOpenExercise: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  return (
    <View style={[styles.row, { borderTopColor: palette.border }, picked && { backgroundColor: palette.accentSoft }]}>
      {selecting ? (
        <View style={styles.check}><Icon name={picked ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={picked ? palette.accentStrong : palette.textMuted} /></View>
      ) : handle}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('programBuilder.editExercise', { name })}
        accessibilityState={selecting ? { selected: picked } : undefined}
        onPress={onPress}
        onLongPress={onOpenExercise}
        accessibilityActions={[{ name: 'longpress', label: t('logger.openExercise') }]}
        onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') onOpenExercise(); }}
        style={styles.main}
      >
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
        <View style={styles.lineRow}>
          <Text style={[styles.line, { color: palette.textMuted }]}>{line}</Text>
          {hasNote ? <Icon name="chatbubble-ellipses-outline" size={14} color={palette.textMuted} /> : null}
        </View>
        {invalid ? <Text style={[styles.error, { color: palette.warning }]}>{t('userProgram.errors.invalidValue')}</Text> : null}
      </Pressable>
      {selecting ? null : <IconButton icon="ellipsis-vertical" tone="plain" size={44} label={t('workoutBuilder.rowMenu', { name })} onPress={onMenu} />}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 56, borderTopWidth: StyleSheet.hairlineWidth },
  check: { width: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center', gap: 2, paddingVertical: 6 },
  name: { fontFamily: fonts.semibold, fontSize: 16 },
  lineRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  line: { fontFamily: fonts.mono, fontSize: 13 },
  error: { fontFamily: fonts.medium, fontSize: 14 },
});
