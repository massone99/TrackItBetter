import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../src/shared/components/Text';
import { getGoalSnapshot, saveWeeklyTarget, type GoalSnapshot } from '../src/features/goals/repository';
import { Body, Card, Heading, PageHeading, ProgressMeter, Screen, SectionTitle, Icon } from '../src/shared/components/ui';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';
import { fonts } from '../src/shared/theme/typography';

const copy = {
  en: {
    title: 'Goals & consistency', subtitle: 'Build a steady rhythm, one session at a time.', weeklyGoal: 'Weekly session goal', target: '{{count}} sessions per week', progress: '{{done}} of {{target}} sessions this week', reached: 'Weekly goal reached. Nice work.', streaks: 'Your streaks', current: 'Current streak', longest: 'Longest streak', days: 'days', yearRecap: '{{year}} recap', yearSessions: 'Sessions', yearActiveDays: 'Active days', heatmap: 'Consistency · last 13 weeks', heatmapHelp: 'Each square is one day. Darker squares show more completed workouts.', less: 'Less', more: 'More', achievements: 'Achievements', loading: 'Gathering your training history…', error: 'Goals could not be loaded. Try again.', retry: 'Retry', unlocked: 'Unlocked', locked: '{{progress}} / {{target}}', weekdays: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
    achievement: {
      'first-session': ['First step', 'Complete your first workout.'],
      'five-sessions': ['Finding a rhythm', 'Complete five workouts.'],
      'ten-sessions': ['Ten sessions strong', 'Complete ten workouts.'],
      'week-goal': ['Weekly goal', 'Reach your {{target}}-session goal this week.'],
      'three-day-streak': ['Three-day streak', 'Train on three consecutive days.'],
      'seven-day-streak': ['Seven-day streak', 'Train on seven consecutive days.'],
    },
  },
  it: {
    title: 'Obiettivi e costanza', subtitle: 'Costruisci un ritmo regolare, una sessione alla volta.', weeklyGoal: 'Obiettivo settimanale', target: '{{count}} sessioni a settimana', progress: '{{done}} di {{target}} sessioni questa settimana', reached: 'Obiettivo settimanale raggiunto. Ottimo lavoro.', streaks: 'Le tue serie', current: 'Serie attuale', longest: 'Serie più lunga', days: 'giorni', yearRecap: 'Riepilogo {{year}}', yearSessions: 'Sessioni', yearActiveDays: 'Giorni attivi', heatmap: 'Costanza · ultime 13 settimane', heatmapHelp: 'Ogni quadrato rappresenta un giorno. Più è scuro, più allenamenti hai completato.', less: 'Meno', more: 'Più', achievements: 'Traguardi', loading: 'Caricamento dello storico…', error: 'Impossibile caricare gli obiettivi. Riprova.', retry: 'Riprova', unlocked: 'Sbloccato', locked: '{{progress}} / {{target}}', weekdays: ['L', 'M', 'M', 'G', 'V', 'S', 'D'],
    achievement: {
      'first-session': ['Primo passo', 'Completa il tuo primo allenamento.'],
      'five-sessions': ['Trova il tuo ritmo', 'Completa cinque allenamenti.'],
      'ten-sessions': ['Dieci sessioni', 'Completa dieci allenamenti.'],
      'week-goal': ['Obiettivo settimanale', 'Raggiungi il tuo obiettivo di {{target}} sessioni questa settimana.'],
      'three-day-streak': ['Tre giorni di fila', 'Allenati per tre giorni consecutivi.'],
      'seven-day-streak': ['Sette giorni di fila', 'Allenati per sette giorni consecutivi.'],
    },
  },
} as const;

export default function GoalsScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const language = i18n.language.toLowerCase().startsWith('it') ? 'it' : 'en';
  const strings = copy[language];
  const [snapshot, setSnapshot] = useState<GoalSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    setFailed(false);
    void getGoalSnapshot().then(setSnapshot).catch(() => setFailed(true));
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    setFailed(false);
    void getGoalSnapshot().then((value) => { if (active) setSnapshot(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []));

  const changeTarget = async (delta: number) => {
    if (!snapshot || saving) return;
    const next = Math.max(1, Math.min(7, snapshot.weeklyTarget + delta));
    if (next === snapshot.weeklyTarget) return;
    setSaving(true);
    try {
      await saveWeeklyTarget(next);
      const updated = await getGoalSnapshot();
      setSnapshot(updated);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <PageHeading title={strings.title} subtitle={strings.subtitle} />
      {snapshot ? <>
        <Card>
          <SectionTitle title={strings.weeklyGoal} />
          <View style={styles.targetRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('goals.decreaseTarget')} accessibilityState={{ disabled: snapshot.weeklyTarget <= 1 || saving }} disabled={snapshot.weeklyTarget <= 1 || saving} onPress={() => void changeTarget(-1)} style={[styles.adjustButton, { backgroundColor: palette.surfaceMuted, opacity: snapshot.weeklyTarget <= 1 ? 0.45 : 1 }]}><Text style={[styles.adjustText, { color: palette.text }]}>−</Text></Pressable>
            <View style={styles.targetText}>
              <Heading>{t('goals.target', { count: snapshot.weeklyTarget })}</Heading>
              <Body>{t('goals.progress', { done: Math.min(snapshot.thisWeekSessions, snapshot.weeklyTarget), target: snapshot.weeklyTarget })}</Body>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('goals.increaseTarget')} accessibilityState={{ disabled: snapshot.weeklyTarget >= 7 || saving }} disabled={snapshot.weeklyTarget >= 7 || saving} onPress={() => void changeTarget(1)} style={[styles.adjustButton, { backgroundColor: palette.surfaceMuted, opacity: snapshot.weeklyTarget >= 7 ? 0.45 : 1 }]}><Text style={[styles.adjustText, { color: palette.text }]}>+</Text></Pressable>
          </View>
          <ProgressMeter value={snapshot.thisWeekSessions} total={snapshot.weeklyTarget} label={strings.weeklyGoal} tone={snapshot.thisWeekSessions >= snapshot.weeklyTarget ? 'success' : 'accent'} />
          {snapshot.thisWeekSessions >= snapshot.weeklyTarget ? <Body style={{ color: palette.success }}>{strings.reached}</Body> : null}
        </Card>

        <Card>
          <SectionTitle title={strings.streaks} />
          <View style={styles.streakRow}>
            <StreakMetric label={strings.current} value={snapshot.currentStreak} days={strings.days} color={palette.accentStrong} text={palette.text} />
            <StreakMetric label={strings.longest} value={snapshot.longestStreak} days={strings.days} color={palette.accentStrong} text={palette.text} />
          </View>
        </Card>

        <Card>
          <SectionTitle title={strings.yearRecap.replace('{{year}}', String(snapshot.year))} />
          <View style={styles.recapRow}>
            <StreakMetric label={strings.yearSessions} value={snapshot.yearSessions} days="" color={palette.accentStrong} text={palette.text} />
            <StreakMetric label={strings.yearActiveDays} value={snapshot.yearActiveDays} days="" color={palette.accentStrong} text={palette.text} />
          </View>
        </Card>

        <Card>
          <SectionTitle title={strings.heatmap} />
          <Body>{strings.heatmapHelp}</Body>
          <View style={styles.heatmapRows} accessibilityRole="image" accessibilityLabel={strings.heatmap}>
            <View style={styles.weekdayLabels}>{strings.weekdays.map((day, index) => <Text key={`${day}-${index}`} style={[styles.weekday, { color: palette.textMuted }]}>{day}</Text>)}</View>
            <View style={styles.heatmap}>
              {Array.from({ length: 7 }, (_, dayIndex) => <View key={`day-${dayIndex}`} style={styles.heatmapRow}>
                {Array.from({ length: 13 }, (_, weekIndex) => {
                  const day = snapshot.activeDays[weekIndex * 7 + dayIndex];
                  return <View key={day.date} accessibilityLabel={`${day.date}: ${day.count}`} style={[styles.dayCell, { backgroundColor: heatColor(day.count, palette) }]} />;
                })}
              </View>)}
            </View>
          </View>
          <View style={styles.legend}><Body>{strings.less}</Body>{[0, 1, 2, 3].map((level) => <View key={level} style={[styles.legendCell, { backgroundColor: heatColor(level, palette) }]} />)}<Body>{strings.more}</Body></View>
        </Card>

        <Card>
          <SectionTitle title={strings.achievements} />
          {snapshot.achievements.map((achievement) => {
            const achievementCopy = strings.achievement[achievement.id as keyof typeof strings.achievement];
            const title = achievementCopy[0];
            const description = achievementCopy[1].replace('{{target}}', String(achievement.target));
            return <View key={achievement.id} style={[styles.achievementRow, { borderTopColor: palette.border }]}>
              <View style={[styles.badge, { backgroundColor: achievement.unlocked ? palette.accent : palette.surfaceMuted }]}><Icon name={achievement.unlocked ? 'ribbon' : 'lock-closed-outline'} size={16} color={achievement.unlocked ? palette.accentText : palette.textMuted} /></View>
              <View style={styles.achievementText}>
                <Text style={[styles.achievementTitle, { color: palette.text }]}>{title}</Text>
                <Body>{description}</Body>
              </View>
              <Text style={[styles.achievementProgress, { color: achievement.unlocked ? palette.accentStrong : palette.textMuted }]}>{achievement.unlocked ? strings.unlocked : t('goals.locked', { progress: achievement.progress, target: achievement.target })}</Text>
            </View>;
          })}
        </Card>
      </> : <Card>
        {failed ? <><Heading>{strings.error}</Heading><Text onPress={refresh} style={[styles.retry, { color: palette.accentStrong }]} accessibilityRole="button">{strings.retry}</Text></> : <><ActivityIndicator color={palette.accentStrong} /><Body>{strings.loading}</Body></>}
      </Card>}
    </Screen>
  );
}

function StreakMetric({ label, value, days, color, text }: { label: string; value: number; days: string; color: string; text: string }) {
  const styles = useScaledStyles(baseStyles);
  return <View style={styles.streakMetric}><Text style={[styles.streakValue, { color }]}>{value}</Text><Text style={[styles.streakDays, { color: text }]}>{days}</Text><Body>{label}</Body></View>;
}

function heatColor(count: number, palette: ReturnType<typeof useTheme>['palette']): string {
  if (count <= 0) return palette.surfaceMuted;
  if (count === 1) return palette.accent;
  if (count === 2) return palette.accentStrong;
  return palette.text;
}

const baseStyles = StyleSheet.create({
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  targetText: { flex: 1, gap: 3 },
  adjustButton: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  adjustText: { fontSize: 24, fontWeight: '800' },
  streakRow: { flexDirection: 'row', gap: 12 },
  recapRow: { flexDirection: 'row', gap: 12 },
  streakMetric: { flex: 1, minHeight: 110, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 3 },
  streakValue: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, fontVariant: ['tabular-nums'] },
  streakDays: { marginTop: -5, fontSize: 13, fontWeight: '700' },
  heatmapRows: { flexDirection: 'row', gap: 6, alignItems: 'stretch' },
  heatmap: { flex: 1, gap: 4 },
  heatmapRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  dayCell: { flex: 1, aspectRatio: 1, minHeight: 9, borderRadius: 3 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end' },
  legendCell: { width: 12, height: 12, borderRadius: 3 },
  weekdayLabels: { justifyContent: 'space-between', paddingVertical: 1 },
  weekday: { minHeight: 16, width: 16, textAlign: 'center', fontSize: 12, fontWeight: '700' },
  achievementRow: { minHeight: 75, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 20, fontWeight: '900' },
  achievementText: { flex: 1, gap: 2 },
  achievementTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  achievementProgress: { flexShrink: 1, maxWidth: '30%', fontSize: 13, lineHeight: 19, fontWeight: '600', textAlign: 'right' },
  retry: { fontSize: 15, fontWeight: '800' },
});
