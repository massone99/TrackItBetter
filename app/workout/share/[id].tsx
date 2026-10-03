import { completedSetCount } from '../../../src/domain/setPairs';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';
import { Text } from '../../../src/shared/components/Text';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { getCompletedWorkout } from '../../../src/features/session/repository';
import type { CompletedWorkout } from '../../../src/features/session/repository';
import { ActionButton, Label, PageHeading, Screen } from '../../../src/shared/components/ui';
import { useTheme } from '../../../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../../../src/shared/theme/useScaledStyles';
import { goBack } from '../../../src/shared/navigation/goBack';

export default function ShareWorkoutScreen() {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const cardRef = useRef<View>(null);
  const [workout, setWorkout] = useState<CompletedWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getCompletedWorkout(id).then((value) => {
      if (active) setWorkout(value);
    }).catch(() => {
      if (active) setWorkout(null);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [id]);

  const share = useCallback(async () => {
    if (!workout || Platform.OS === 'web') {
      setError(t('shareCard.unavailable'));
      return;
    }
    setSharing(true);
    setError(null);
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('sharing unavailable');
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: t('shareCard.title') });
    } catch {
      setError(t('shareCard.error'));
    } finally {
      setSharing(false);
    }
  }, [workout, t]);

  const locale = i18n.language.startsWith('it') ? 'it-IT' : 'en-US';
  if (loading) return <Screen><PageHeading title={t('shareCard.title')} subtitle={t('shareCard.loading')} /></Screen>;
  if (!workout) return <Screen><PageHeading title={t('shareCard.title')} subtitle={t('shareCard.unavailable')} /><ActionButton label={t('history.back')} onPress={() => goBack('/(tabs)/log')} /></Screen>;

  const duration = Math.max(0, Math.round((workout.endedAt.getTime() - workout.startedAt.getTime()) / 60_000));
  const completedSets = workout.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.completedAt).length;
  const movements = workout.exercises.filter((exercise) => exercise.sets.some((set) => set.completedAt));
  return (
    <Screen>
      <PageHeading title={t('shareCard.title')} subtitle={t('shareCard.help')} />
      <View ref={cardRef} collapsable={false} style={[styles.shareCanvas, { backgroundColor: palette.background }]}>
        <View style={[styles.brandMark, { backgroundColor: palette.accent }]}><Text style={[styles.brandText, { color: palette.accentText }]}>TRACKITBETTER</Text></View>
        <Text style={[styles.cardTitle, { color: palette.text }]}>{workout.name}</Text>
        <Text style={[styles.cardDate, { color: palette.textMuted }]}>{workout.startedAt.toLocaleDateString(locale, { dateStyle: 'long' })}</Text>
        <View style={styles.stats}>
          <Stat value={`${completedSets}`} label={t('shareCard.sets')} palette={palette} />
          <Stat value={`${movements.length}`} label={t('shareCard.movements')} palette={palette} />
          <Stat value={`${duration} ${t('history.minutes')}`} label={t('shareCard.duration')} palette={palette} />
        </View>
        <View style={[styles.divider, { backgroundColor: palette.border }]} />
        {movements.slice(0, 5).map((exercise) => {
          const count = completedSetCount(exercise.sets);
          return <View key={exercise.entryId} style={styles.movementRow}>
            <Text numberOfLines={1} style={[styles.movementName, { color: palette.text }]}>{exercise.name}</Text>
            <Text style={[styles.movementCount, { color: palette.accentStrong }]}>{count} {t('shareCard.sets')}</Text>
          </View>;
        })}
        {movements.length > 5 ? <Text style={[styles.more, { color: palette.textMuted }]}>{t('shareCard.more', { count: movements.length - 5 })}</Text> : null}
        <Text style={[styles.footer, { color: palette.textMuted }]}>{t('shareCard.footer')}</Text>
      </View>
      {error ? <Text accessibilityRole="alert" style={{ color: palette.warning }}>{error}</Text> : null}
      <ActionButton label={t(sharing ? 'shareCard.sharing' : 'shareCard.action')} onPress={() => { if (!sharing) void share(); }} />
      <ActionButton label={t('history.back')} secondary onPress={() => goBack('/(tabs)/log')} />
    </Screen>
  );
}

function Stat({ value, label, palette }: { value: string; label: string; palette: ReturnType<typeof useTheme>['palette'] }) {
  const styles = useScaledStyles(baseStyles);
  return <View style={styles.stat}><Text style={[styles.statValue, { color: palette.accentStrong }]}>{value}</Text><Label style={styles.statLabel}>{label}</Label></View>;
}

const baseStyles = StyleSheet.create({
  shareCanvas: { width: '100%', padding: 24, borderRadius: 26, gap: 14 },
  brandMark: { alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9 },
  brandText: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  cardTitle: { fontSize: 28, lineHeight: 34, fontWeight: '900', marginTop: 4 },
  cardDate: { fontSize: 14 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  stat: { gap: 3, flex: 1 },
  statValue: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 11 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 3 },
  movementRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  movementName: { flex: 1, fontSize: 14, fontWeight: '700' },
  movementCount: { fontSize: 12, fontWeight: '800' },
  more: { fontSize: 12 },
  footer: { marginTop: 8, fontSize: 12 },
});
