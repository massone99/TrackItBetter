import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { nextSessionInRotation, type UserProgram } from '../../../domain/userProgram';
import { Icon, Tag, Text, tapFeedback } from '../../../shared/components/ui';
import { radii } from '../../../shared/theme/tokens';
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

/** One program, dense (or barebone names-only); a long press or the dots open its actions. */
export function ProgramRow({ program, recentNames, now, barebone = false, onOpen, onActions }: {
  program: UserProgram;
  recentNames: readonly string[];
  now: Date;
  barebone?: boolean;
  onOpen: () => void;
  onActions: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const progress = programDone(program, recentNames);
  const status = statusOf(program);
  const next = nextSessionInRotation(program, recentNames);
  const nextIndex = next ? program.sessions.findIndex((session) => session.id === next.id) : -1;
  const meta = [
    program.author || null,
    next ? t('userProgram.nextShort', { name: next.name }) : t('programsList.workouts', { count: program.sessions.length }),
    lastUsedText(t, program.lastUsedAt, now),
  ].filter(Boolean).join(' · ');

  if (barebone) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${program.name}, ${meta}`}
        accessibilityActions={[{ name: 'longpress', label: t('programsList.actionsFor', { name: program.name }) }]}
        onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') onActions(); }}
        onPress={() => { tapFeedback(); onOpen(); }}
        onLongPress={onActions}
        style={({ pressed }) => [styles.barebone, { backgroundColor: pressed ? palette.surfaceMuted : 'transparent' }]}
      >
        <Text style={[styles.bareboneName, { color: palette.text }]}>{program.name}</Text>
      </Pressable>
    );
  }

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
          {program.category || (program.clusters && program.clusters.length > 0) || status !== 'active' ? (
            <View style={styles.tags}>
              {program.category ? <Tag color={palette.accentStrong}>{program.category}</Tag> : null}
              {(program.clusters ?? []).map((cluster) => (
                <Tag key={cluster} color={palette.textMuted}>{cluster}</Tag>
              ))}
              {status !== 'active' ? <Tag color={palette.warning}>{t(`programsList.status.${status}`)}</Tag> : null}
            </View>
          ) : null}
        </View>
        {program.sessions.length <= 8 ? (
          // One square per workout of the rotation; the filled one is up next.
          <View accessible accessibilityLabel={`${progress.done}/${progress.total}`} style={styles.rotation}>
            {program.sessions.map((session, index) => (
              <View key={session.id} style={[styles.square, index === nextIndex ? { backgroundColor: palette.accentStrong } : { borderWidth: 1, borderColor: palette.textMuted }]} />
            ))}
          </View>
        ) : <Text style={[styles.count, { color: palette.textMuted }]}>{progress.done}/{progress.total}</Text>}
        <Icon name="chevron-forward" size={18} color={palette.textMuted} />
      </Pressable>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingLeft: 14, paddingRight: 8 },
  barebone: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  bareboneName: { fontFamily: fonts.semibold, fontSize: 15 },
  copy: { flex: 1, minWidth: 0, gap: 2, alignItems: 'flex-start' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  name: { fontFamily: fonts.semibold, fontSize: 17 },
  meta: { fontFamily: fonts.body, fontSize: 13 },
  count: { fontFamily: fonts.mono, fontSize: 13 },
  rotation: { flexDirection: 'row', gap: 3 },
  square: { width: 10, height: 10, borderRadius: radii.small },
});
