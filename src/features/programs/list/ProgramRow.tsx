import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { type UserProgram } from '../../../domain/userProgram';
import { IconButton, Tag, Text, tapFeedback } from '../../../shared/components/ui';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { fonts } from '../../../shared/theme/typography';
import { useScaledStyles } from '../../../shared/theme/useScaledStyles';
import { daysSince, programDone, statusOf } from './derive';

/** "last used today / yesterday / 3 days ago", or "never used". */
export function lastUsedText(t: (key: string, options?: Record<string, unknown>) => string, iso: string | null | undefined, now: Date): string {
  const days = daysSince(iso, now);
  if (days === null) return t('programsList.neverUsed');
  const when = days === 0 ? t('programsList.today') : days === 1 ? t('programsList.yesterday') : t('programsList.daysAgo', { count: days });
  return t('programsList.lastUsed', { when });
}

/** One program, dense: name, "N workouts · last used X", done/total in mono; a long press or the dots open its actions. */
export function ProgramRow({ program, recentNames, now, onOpen, onActions }: {
  program: UserProgram;
  recentNames: readonly string[];
  now: Date;
  onOpen: () => void;
  onActions: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const progress = programDone(program, recentNames);
  const status = statusOf(program);
  const meta = `${t('programsList.workouts', { count: program.sessions.length })} · ${lastUsedText(t, program.lastUsedAt, now)}`;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${program.name}, ${meta}`}
        accessibilityActions={[{ name: 'longpress', label: t('programsList.actionsFor', { name: program.name }) }]}
        onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') onActions(); }}
        onPress={() => { tapFeedback(); onOpen(); }}
        onLongPress={onActions}
        style={({ pressed }) => [styles.main, { backgroundColor: pressed ? palette.surfaceMuted : 'transparent' }]}
      >
        <View style={styles.copy}>
          <Text style={[styles.name, { color: palette.text }]}>{program.name}</Text>
          <Text style={[styles.meta, { color: palette.textMuted }]}>{meta}</Text>
          {status !== 'active' ? <Tag color={palette.warning}>{t(`programsList.status.${status}`)}</Tag> : null}
        </View>
        <Text style={[styles.count, { color: palette.textMuted }]}>{progress.done}/{progress.total}</Text>
      </Pressable>
      <IconButton icon="ellipsis-vertical" tone="plain" size={48} label={t('programsList.actionsFor', { name: program.name })} onPress={onActions} />
    </View>
  );
}

const baseStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, paddingLeft: 12 },
  copy: { flex: 1, minWidth: 0, gap: 2, alignItems: 'flex-start' },
  name: { fontFamily: fonts.semibold, fontSize: 16 },
  meta: { fontFamily: fonts.body, fontSize: 13 },
  count: { fontFamily: fonts.mono, fontSize: 13 },
});
