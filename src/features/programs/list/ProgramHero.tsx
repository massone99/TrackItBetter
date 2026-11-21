import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { estimateSessionSeconds, sessionSetCount, type UserProgram, type UserProgramSession } from '../../../domain/userProgram';
import { readDefaultRest } from '../../session/restDefaults';
import { ActionButton, Text, tapFeedback } from '../../../shared/components/ui';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { fonts } from '../../../shared/theme/typography';
import { radii, spacing } from '../../../shared/theme/tokens';
import { formatMinutes } from '../../../shared/utils/format';
import { useScaledStyles } from '../../../shared/theme/useScaledStyles';

const NO_METRICS: ReadonlyMap<string, string> = new Map();

/** Up next: the next workout of the program in hand, its size, and one tap to start it. */
export function ProgramHero({ program, next, starting, onOpen, onStart }: {
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
  const position = program.sessions.findIndex((session) => session.id === next.id) + 1;
  const seconds = estimateSessionSeconds(next, NO_METRICS, readDefaultRest('working'));
  return (
    <View style={[styles.hero, { backgroundColor: palette.hero }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${program.name}, ${t('programsList.openProgram')}`} onPress={() => { tapFeedback(); onOpen(); }} style={styles.top}>
        <Text style={[styles.eyebrow, { color: palette.heroTextMuted }]}>{t('simple.upNextProgram', { program: program.name, current: Math.max(1, position), total: program.sessions.length })}</Text>
        <Text style={[styles.name, { color: palette.heroText }]}>{next.name}</Text>
        <Text style={[styles.meta, { color: palette.heroTextMuted }]}>{t('home.sessionMeta', { count: next.exercises.length, sets: sessionSetCount(next), minutes: formatMinutes(seconds) })}</Text>
      </Pressable>
      <ActionButton variant="inverse" icon="play" label={starting ? t('programBuilder.starting') : t('userProgram.start')} disabled={starting} onPress={onStart} />
    </View>
  );
}

const baseStyles = StyleSheet.create({
  hero: { borderRadius: radii.surface, padding: spacing.lg, gap: spacing.md },
  top: { gap: 2, minHeight: 48 },
  eyebrow: { fontFamily: fonts.monoSemibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.7, textTransform: 'uppercase' },
  name: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, textTransform: 'uppercase' },
  meta: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
});
