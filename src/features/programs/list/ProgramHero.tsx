import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { type UserProgram, type UserProgramSession } from '../../../domain/userProgram';
import { ActionButton, ProgressMeter, Tag, Text, tapFeedback } from '../../../shared/components/ui';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { fonts } from '../../../shared/theme/typography';
import { useScaledStyles } from '../../../shared/theme/useScaledStyles';
import { currentGroupLabel, programDone } from './derive';

/** The program in hand: where it stands, what is next, one tap to start it. */
export function ProgramHero({ program, next, recentNames, starting, onOpen, onStart }: {
  program: UserProgram;
  next: UserProgramSession;
  recentNames: readonly string[];
  starting: boolean;
  onOpen: () => void;
  onStart: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const progress = programDone(program, recentNames);
  const group = currentGroupLabel(program, next, recentNames);
  return (
    <View style={[styles.hero, { borderColor: palette.accentStrong, backgroundColor: palette.surface }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${program.name}, ${t('programsList.openProgram')}`} onPress={() => { tapFeedback(); onOpen(); }} style={styles.heroTop}>
        <Tag color={palette.accentStrong}>{group ? `${t('programsList.inProgress')} · ${group.name} · ${group.done}/${group.total}` : t('programsList.inProgress')}</Tag>
        <Text style={[styles.name, { color: palette.text }]}>{program.name}</Text>
      </Pressable>
      <View style={styles.progressRow}>
        <View style={styles.meter}><ProgressMeter value={progress.done} total={progress.total} label={t('programsList.progressLabel', { done: progress.done, total: progress.total })} /></View>
        <Text style={[styles.count, { color: palette.textMuted }]}>{progress.done}/{progress.total}</Text>
      </View>
      <Text style={[styles.next, { color: palette.textMuted }]}>{t('userProgram.nextShort', { name: next.name })}</Text>
      <ActionButton icon="play" label={starting ? t('programBuilder.starting') : t('userProgram.start')} disabled={starting} onPress={onStart} />
    </View>
  );
}

const baseStyles = StyleSheet.create({
  hero: { borderWidth: 1.5, borderRadius: 4, padding: 16, gap: 12 },
  heroTop: { gap: 4, minHeight: 48, justifyContent: 'center' },
  name: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  meter: { flex: 1, minWidth: 120 },
  count: { fontFamily: fonts.mono, fontSize: 13 },
  next: { fontFamily: fonts.medium, fontSize: 14 },
});
