import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ExerciseHistorySession } from '../analytics/repository';
import { Icon, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { describeSets } from './describeSets';
import { useEquipment, bandsById } from '../equipment/useEquipment';
import { amountOf, perSet } from '../../domain/lastTime';
import { formatClock, formatNumber } from '../../shared/utils/format';

/** One logged session: its date and workout, and every set on one line. */
export function HistoryRow({ session, older, metric, locale, first, exerciseId, onSelect, selected = false }: { /** Picking mode: a press chooses this session (instead of opening it) and `selected` marks the chosen one. */ onSelect?: () => void; selected?: boolean; session: ExerciseHistorySession; /** The session before this one, to show how it went compared with it. */ older?: ExerciseHistorySession; metric: string; locale: string; first: boolean; exerciseId: string }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const { t } = useTranslation();
  const { catalog } = useEquipment();
  const colorOf = catalog ? bandsById(catalog) : null;
  const date = session.startedAt.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  // Bands read at a glance: a colour swatch per band and its name, one line per set that used bands.
  const banded = session.sets.filter((set) => (set.bands?.length ?? 0) > 0);
  const working = session.sets.filter((set) => set.kind !== 'warmup');
  const mean = (values: (number | null | undefined)[]) => { const ok = values.filter((value): value is number => value != null); return ok.length ? Math.round((ok.reduce((sum, value) => sum + value, 0) / ok.length) * 10) / 10 : null; };
  const rpe = mean(working.map((set) => set.rpe));
  const form = mean(working.map((set) => set.formRating));
  const rom = mean(working.map((set) => set.romRating));
  const averages = [rpe !== null ? `RPE ${formatNumber(rpe)}` : null, form !== null ? `${t('lastTime.form').toLowerCase()} ${formatNumber(form)}` : null, rom !== null ? `ROM ${formatNumber(rom)}` : null].filter(Boolean).join(' · ');
  const total = (item: ExerciseHistorySession) => perSet(item.sets.map((set) => ({ ...set, completedAt: new Date() })), (set) => amountOf(set, metric)).reduce((sum, value) => sum + value, 0);
  const delta = older ? Math.round((total(session) - total(older)) * 10) / 10 : null;
  const timed = metric === 'time' || metric === 'time_load';
  const trend = delta === null ? null : delta === 0 ? { text: '=', color: palette.textMuted }
    : { text: `${delta > 0 ? '↑ +' : '↓ −'}${timed ? formatClock(Math.abs(delta)) : formatNumber(Math.abs(delta))}`, color: delta > 0 ? palette.success : palette.warning };
  return (
    <Pressable
      accessibilityRole={onSelect ? 'radio' : 'button'}
      accessibilityState={onSelect ? { selected } : undefined}
      accessibilityLabel={`${date}, ${session.workoutName}: ${describeSets(session.sets, metric)}`}
      onPress={onSelect ?? (() => router.push({ pathname: '/workout/entry/[entryId]', params: { entryId: session.entryId, workout: session.workoutId, exercise: exerciseId } }))}
      style={({ pressed }) => [styles.historyRow, selected && { backgroundColor: palette.accentSoft }, !first && { borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth }, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={styles.historyDate}>
        <Text style={[styles.historyDay, { color: palette.text }]}>{session.startedAt.getDate()}</Text>
        <Text style={[styles.historyMonth, { color: palette.textMuted }]}>{session.startedAt.toLocaleDateString(locale, { month: 'short' })}</Text>
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.historyWorkout, { color: palette.textMuted }]}>{session.workoutName}</Text>
        <Text style={[styles.historySets, { color: palette.text }]}>{describeSets(session.sets.map(({ bandCount: _bands, ...set }) => set), metric)}</Text>
        {banded.length > 0 ? (
          <View style={styles.bandList}>
            {banded.map((set) => {
              const bands = set.bands ?? [];
              const names = bands.map((band) => t('bands.chip', { name: colorOf?.get(band.bandId)?.name ?? t('bands.unknown'), tension: band.tension }));
              return (
                <View key={set.id} style={styles.bandLine} accessibilityLabel={`${t('bands.title')}: ${names.join(' + ')}`}>
                  <View style={styles.bandSwatches}>
                    {bands.map((band, position) => (
                      <View key={`${set.id}-${position}`} style={[styles.swatch, { backgroundColor: colorOf?.get(band.bandId)?.color ?? palette.textMuted, borderColor: palette.text }]} />
                    ))}
                  </View>
                  <Text style={[styles.bandName, { color: palette.textMuted }]}>{names.join(' + ')}</Text>
                </View>
              );
            })}
          </View>
        ) : null}
        {averages ? <Text style={[styles.historyAverages, { color: palette.textMuted }]}>{averages}</Text> : null}
      </View>
      {trend ? <Text style={[styles.historyTrend, { color: trend.color }]}>{trend.text}</Text> : null}
      {onSelect ? <Icon name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? palette.accentStrong : palette.textMuted} /> : <Icon name="chevron-forward" size={16} color={palette.textMuted} />}
    </Pressable>
  );
}


const baseStyles = StyleSheet.create({
  flex: { flex: 1 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 16, minHeight: 72 },
  historyDate: { width: 40, alignItems: 'center' },
  historyDay: { fontFamily: fonts.display, fontSize: 22, lineHeight: 24, fontVariant: ['tabular-nums'] },
  historyMonth: { fontFamily: fonts.medium, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 },
  historyWorkout: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  historyAverages: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, marginTop: 2 },
  historyTrend: { fontFamily: fonts.semibold, fontSize: 13, fontVariant: ['tabular-nums'] },
  historySets: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23, marginTop: 4, fontVariant: ['tabular-nums'] },
  bandList: { gap: 4, marginTop: 6 },
  bandLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  bandSwatches: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bandName: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  swatch: { width: 14, height: 14, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth },
});
