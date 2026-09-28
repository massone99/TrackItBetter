import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/shared/components/Text';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Body, Card, Heading, Label, ListGroup, ListRow, PageHeading, Screen, SectionTitle } from '../../src/shared/components/ui';
import { getProgressSnapshot } from '../../src/features/analytics/repository';
import type { ExerciseTrend, PersonalBest, ProgressSnapshot, TrendKind } from '../../src/features/analytics/summary';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { formatBestValue, formatDuration, formatNumber } from '../../src/shared/utils/format';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';

const copy = {
  en: {
    week: 'Last 7 days', sessions: 'Sessions', sets: 'Completed sets', volume: 'Training volume',
    balance: 'Weekly movement balance', pushPull: 'Push : pull', horizontal: 'Horizontal push : pull', vertical: 'Vertical push : pull',
    balanceNote: 'Counts use completed working sets from the last 7 days.', legsNudge: 'Few leg sets logged this week. Consider adding leg work if it fits your plan.',
    reps: 'Repetitions', holds: 'Hold time', distance: 'Distance', loadReps: 'Loaded reps', loadTime: 'Loaded hold time',
    bests: 'Personal bests', emptyTitle: 'Your first best is waiting', emptyBody: 'Complete a few sets to see your strongest efforts and training volume here.',
    trends: 'Exercise trends', trendEmpty: 'Complete an exercise in at least two workouts to see its trend.',
    trendKind: { reps: 'Max reps', hold: 'Longest hold', effective_load: 'Effective load', added_load: 'Added load', estimated1rm: 'Estimated 1RM', distance: 'Distance' },
    loading: 'Gathering your training history…', error: 'Your progress could not be loaded. Try again in a moment.',
    bestKind: { reps: 'Most reps', hold: 'Longest hold', load: 'Heaviest load', estimated1rm: 'Estimated 1RM', distance: 'Farthest distance' },
    dateFirst: 'Earlier', dateLatest: 'Latest', shareBest: 'Share record', shareError: 'Could not create or share the record image.', shareUnavailable: 'Image sharing is unavailable here.',
  },
  it: {
    week: 'Ultimi 7 giorni', sessions: 'Sessioni', sets: 'Serie completate', volume: 'Volume di allenamento',
    balance: 'Equilibrio settimanale', pushPull: 'Spinta : tirata', horizontal: 'Spinta : tirata orizzontale', vertical: 'Spinta : tirata verticale',
    balanceNote: 'Conteggio delle serie completate negli ultimi 7 giorni.', legsNudge: 'Questa settimana hai registrato poche serie per le gambe. Valuta di aggiungerne se rientra nel tuo programma.',
    reps: 'Ripetizioni', holds: 'Tenuta', distance: 'Distanza', loadReps: 'Ripetizioni con carico', loadTime: 'Tenuta con carico',
    bests: 'Record personali', emptyTitle: 'Il primo record ti aspetta', emptyBody: 'Completa alcune serie per vedere qui i tuoi risultati migliori e il volume di allenamento.',
    trends: 'Andamento per esercizio', trendEmpty: 'Completa un esercizio in almeno due allenamenti per vederne l’andamento.',
    trendKind: { reps: 'Ripetizioni massime', hold: 'Tenuta più lunga', effective_load: 'Carico effettivo', added_load: 'Carico aggiunto', estimated1rm: '1RM stimato', distance: 'Distanza' },
    loading: 'Caricamento dello storico…', error: 'Impossibile caricare i progressi. Riprova tra poco.',
    bestKind: { reps: 'Più ripetizioni', hold: 'Tenuta più lunga', load: 'Carico maggiore', estimated1rm: '1RM stimato', distance: 'Distanza maggiore' },
    dateFirst: 'Prima', dateLatest: 'Ultima', shareBest: 'Condividi record', shareError: 'Impossibile creare o condividere l’immagine del record.', shareUnavailable: 'La condivisione di immagini non è disponibile qui.',
  },
} as const;

export default function ProgressScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const strings = i18n.language.toLowerCase().startsWith('it') ? copy.it : copy.en;
  const [snapshot, setSnapshot] = useState<ProgressSnapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    setFailed(false);
    getProgressSnapshot().then((result) => {
      if (active) setSnapshot(result);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, []));

  return (
    <Screen>
      <PageHeading title={t('progress.title')} subtitle={t('progress.subtitle')} />
      <ListGroup>
        <ListRow icon="stats-chart-outline" title={t('stats.open')} subtitle={t('stats.openBody')} onPress={() => router.push('/stats')} />
      </ListGroup>
      {snapshot ? <>
        <View style={styles.metrics}>
          <MetricCard title={strings.week} label={strings.sessions} value={snapshot.weekSessions} palette={palette} />
          <MetricCard title={strings.week} label={strings.sets} value={snapshot.weekSets} palette={palette} />
        </View>
        {snapshot.weeklyBalance.totalSets > 0 && <Card>
          <SectionTitle title={strings.balance} />
          <BalanceMetric label={strings.pushPull} first={snapshot.weeklyBalance.pushSets} second={snapshot.weeklyBalance.pullSets} palette={palette} />
          {(snapshot.weeklyBalance.horizontalPushSets + snapshot.weeklyBalance.horizontalPullSets) > 0 && <BalanceMetric label={strings.horizontal} first={snapshot.weeklyBalance.horizontalPushSets} second={snapshot.weeklyBalance.horizontalPullSets} palette={palette} />}
          {(snapshot.weeklyBalance.verticalPushSets + snapshot.weeklyBalance.verticalPullSets) > 0 && <BalanceMetric label={strings.vertical} first={snapshot.weeklyBalance.verticalPushSets} second={snapshot.weeklyBalance.verticalPullSets} palette={palette} />}
          <Body>{strings.balanceNote}</Body>
          {snapshot.weeklyBalance.showLegsNudge && <Text style={[styles.legsNudge, { color: palette.text }]}>{strings.legsNudge}</Text>}
        </Card>}
        <Card>
          <Label>{strings.volume}</Label>
          <View style={styles.volumeGrid}>
            <VolumeMetric label={strings.reps} value={`${snapshot.volume.reps}`} palette={palette} />
            <VolumeMetric label={strings.holds} value={formatDuration(snapshot.volume.holdSeconds)} palette={palette} />
            <VolumeMetric label={strings.distance} value={`${formatNumber(snapshot.volume.distanceMeters)} m`} palette={palette} />
            <VolumeMetric label={strings.loadReps} value={`${formatNumber(snapshot.volume.loadRepsKg)} kg·rep`} palette={palette} />
            <VolumeMetric label={strings.loadTime} value={`${formatNumber(snapshot.volume.loadSecondsKg)} kg·s`} palette={palette} />
          </View>
          <Body>{snapshot.sessions} {i18n.language.toLowerCase().startsWith('it') ? 'sessioni registrate' : 'sessions logged'} · {snapshot.completedSets} {i18n.language.toLowerCase().startsWith('it') ? 'serie completate' : 'completed sets'}</Body>
        </Card>
        <Card>
          <SectionTitle title={strings.trends} />
          {snapshot.trends.length ? snapshot.trends.slice(0, 8).map((trend) => (
            <TrendCard key={`${trend.exerciseId}-${trend.kind}`} trend={trend} label={strings.trendKind[trend.kind]} palette={palette} locale={i18n.language} />
          )) : <Body>{strings.trendEmpty}</Body>}
        </Card>
        <Card>
          <SectionTitle title={strings.bests} />
          {snapshot.personalBests.length ? snapshot.personalBests.map((best) => (
            <BestRow key={`${best.exerciseId}-${best.kind}`} best={best} label={strings.bestKind[best.kind]} palette={palette} />
          )) : <View style={styles.empty}>
            <Heading>{strings.emptyTitle}</Heading>
            <Body>{strings.emptyBody}</Body>
          </View>}
        </Card>
      </> : <Card style={styles.loadingCard}>
        {failed ? <>
          <Heading>{strings.error}</Heading>
          <Text onPress={() => { setFailed(false); getProgressSnapshot().then(setSnapshot).catch(() => setFailed(true)); }} style={[styles.retry, { color: palette.accentStrong }]} accessibilityRole="button">{i18n.language.toLowerCase().startsWith('it') ? 'Riprova' : 'Retry'}</Text>
        </> : <><ActivityIndicator color={palette.accentStrong} /><Body>{strings.loading}</Body></>}
      </Card>}
    </Screen>
  );
}

/** Opens the statistics explorer on the same exercise and measure. */
const TREND_METRIC: Record<TrendKind, string> = { reps: 'bestReps', hold: 'bestHold', effective_load: 'bestLoad', added_load: 'bestLoad', estimated1rm: 'bestE1rm', distance: 'distanceM' };

function TrendCard({ trend, label, palette, locale }: { trend: ExerciseTrend; label: string; palette: ReturnType<typeof useTheme>['palette']; locale: string }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  // Estimates are per workout; line them up with the logged points by workout date.
  const estimateByDate = new Map((trend.estimate ?? []).map((point) => [point.date.getTime(), point.value]));
  const estimate = trend.estimate?.length ? trend.points.map((point) => estimateByDate.get(point.date.getTime()) ?? null) : undefined;
  const latestEstimate = trend.estimate?.[trend.estimate.length - 1]?.value;
  const values = trend.points.map((point) => point.value);
  const first = values[0];
  const latest = values[values.length - 1];
  const delta = latest - first;
  const deltaText = `${delta > 0 ? '+' : ''}${formatNumber(delta)}${trendUnit(trend.kind)}`;
  const metric = latestEstimate != null ? (trend.kind === 'hold' ? 'estMaxHold' : 'estMaxReps') : TREND_METRIC[trend.kind];
  const open = () => router.push({ pathname: '/stats', params: { exerciseId: trend.exerciseId, metric } });
  return <Pressable accessibilityRole="button" accessibilityLabel={`${trend.exerciseName} · ${label}`} onPress={open} style={[styles.trendCard, { borderTopColor: palette.border }]}>
    <View style={styles.trendHeader}>
      <View style={styles.bestText}>
        <Text numberOfLines={1} style={[styles.exerciseName, { color: palette.text }]}>{trend.exerciseName}</Text>
        <Body>{label}</Body>
      </View>
      <View style={styles.trendLatest}>
        <Text style={[styles.bestValue, { color: palette.accentStrong }]}>{formatNumber(latest)}{trendUnit(trend.kind)}</Text>
        <Text style={[styles.trendDelta, { color: delta >= 0 ? palette.accentStrong : palette.textMuted }]}>{deltaText}</Text>
      </View>
    </View>
    {latestEstimate != null ? <Text style={[styles.trendEstimate, { color: palette.record }]}>{t('estimate.trendLine', { value: `${formatNumber(Math.round(latestEstimate))}${trendUnit(trend.kind)}` })}</Text> : null}
    <TrendLine values={values} estimate={estimate} color={palette.accentStrong} estimateColor={palette.record} muted={palette.border} />
    <View style={styles.trendDates}>
      <Body style={styles.trendDate}>{formatTrendDate(trend.points[0].date, locale)}</Body>
      <Body style={styles.trendDate}>{formatTrendDate(trend.points[trend.points.length - 1].date, locale)}</Body>
    </View>
  </Pressable>;
}

/** One line for the logged values and, when there is one, a lighter line for the RPE estimate on the same scale. */
function TrendLine({ values, estimate, color, estimateColor, muted }: { values: number[]; estimate?: (number | null)[]; color: string; estimateColor: string; muted: string }) {
  const styles = useScaledStyles(baseStyles);
  const [width, setWidth] = useState(280);
  const height = 58;
  const inset = 5;
  const all = [...values, ...(estimate ?? []).filter((value): value is number => value != null)];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const place = (value: number, index: number) => ({
    x: inset + (values.length === 1 ? 0 : index * (width - inset * 2) / (values.length - 1)),
    y: height - inset - (value - min) * (height - inset * 2) / span,
  });
  const points = values.map(place);
  const estimatePoints = (estimate ?? []).map((value, index) => (value == null ? null : place(value, index))).filter((point): point is { x: number; y: number } => point != null);
  const segments = (line: { x: number; y: number }[], lineColor: string, key: string, thin = false) => line.slice(1).map((point, index) => {
    const previous = line[index];
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    return <View key={`${key}-${index}`} style={[styles.chartSegment, { width: length, left: (previous.x + point.x - length) / 2, top: (previous.y + point.y) / 2 - 1, backgroundColor: lineColor, transform: [{ rotate: `${angle}deg` }] }, thin && styles.chartSegmentThin]} />;
  });
  return <View onLayout={(event) => setWidth(Math.max(120, event.nativeEvent.layout.width))} style={[styles.chart, { height }]}>
    <View style={[styles.chartBase, { backgroundColor: muted }]} />
    {segments(estimatePoints, estimateColor, 'estimate', true)}
    {estimatePoints.map((point, index) => <View key={`estimate-point-${index}`} style={[styles.chartEstimatePoint, { left: point.x - 3, top: point.y - 3, backgroundColor: estimateColor }]} />)}
    {segments(points, color, 'line')}
    {points.map((point, index) => <View key={`point-${index}`} style={[styles.chartPoint, { left: point.x - 4, top: point.y - 4, borderColor: color, backgroundColor: 'white' }]} />)}
  </View>;
}

function trendUnit(kind: TrendKind): string {
  if (kind === 'reps') return ' reps';
  if (kind === 'hold') return ' s';
  if (kind === 'distance') return ' m';
  return ' kg';
}

function formatTrendDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);
}

function MetricCard({ title, label, value, palette }: { title: string; label: string; value: number; palette: ReturnType<typeof useTheme>['palette'] }) {
  const styles = useScaledStyles(baseStyles);
  return <Card style={styles.metricCard}>
    <Label>{title}</Label>
    <Text style={[styles.metricValue, { color: palette.text }]}>{value}</Text>
    <Body>{label}</Body>
  </Card>;
}

function VolumeMetric({ label, value, palette }: { label: string; value: string; palette: ReturnType<typeof useTheme>['palette'] }) {
  const styles = useScaledStyles(baseStyles);
  return <View style={styles.volumeItem}>
    <Text style={[styles.volumeValue, { color: palette.text }]}>{value}</Text>
    <Body style={styles.volumeLabel}>{label}</Body>
  </View>;
}

function BalanceMetric({ label, first, second, palette }: { label: string; first: number; second: number; palette: ReturnType<typeof useTheme>['palette'] }) {
  const styles = useScaledStyles(baseStyles);
  const ratio = first === 0 && second === 0 ? '—' : second === 0 ? `${first} : 0` : `${(first / second).toFixed(1)} : 1`;
  return <View style={[styles.balanceRow, { borderTopColor: palette.border }]}>
    <Body style={styles.balanceLabel}>{label}</Body>
    <Text style={[styles.balanceValue, { color: palette.text }]}>{ratio}</Text>
    <Body style={styles.balanceCount}>{first} : {second}</Body>
  </View>;
}

function BestRow({ best, label, palette }: { best: PersonalBest; label: string; palette: ReturnType<typeof useTheme>['palette'] }) {
  const styles = useScaledStyles(baseStyles);
  const { i18n } = useTranslation();
  const [error, setError] = useState(false);
  const cardRef = useRef<View>(null);
  const date = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(best.achievedAt);
  const strings = i18n.language.toLowerCase().startsWith('it') ? copy.it : copy.en;
  const share = async () => {
    if (Platform.OS === 'web') { setError(true); return; }
    try {
      if (!(await Sharing.isAvailableAsync()) || !cardRef.current) throw new Error('sharing unavailable');
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: strings.shareBest });
      setError(false);
    } catch {
      setError(true);
    }
  };
  return <View style={[styles.bestRow, { borderTopColor: palette.border }]}>
    <View ref={cardRef} collapsable={false} style={[styles.bestShareCard, { backgroundColor: palette.surfaceMuted }]}>
      <Text style={[styles.bestBrand, { color: palette.accentStrong }]}>TRACKITBETTER</Text>
      <Text numberOfLines={1} style={[styles.exerciseName, { color: palette.text }]}>{best.exerciseName}</Text>
      <Body>{label} · {date}</Body>
      <Text style={[styles.bestValue, { color: palette.accentStrong }]}>{formatBestValue(best)}</Text>
    </View>
    <View style={styles.shareControl}>
      <Pressable accessibilityRole="button" onPress={() => void share()} style={[styles.shareBestButton, { backgroundColor: palette.surfaceMuted }]}><Text style={{ color: palette.accentStrong, fontWeight: '800' }}>{strings.shareBest}</Text></Pressable>
      {error ? <Body style={{ color: palette.warning }}>{Platform.OS === 'web' ? strings.shareUnavailable : strings.shareError}</Body> : null}
    </View>
  </View>;
}

const baseStyles = StyleSheet.create({
  metrics: { flexDirection: 'row', gap: 12 },
  metricCard: { flex: 1, minHeight: 132, justifyContent: 'space-between' },
  metricValue: { fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  volumeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  volumeItem: { width: '48%', minHeight: 65, justifyContent: 'center' },
  volumeValue: { fontSize: 18, fontWeight: '800' },
  volumeLabel: { fontSize: 12 },
  balanceRow: { minHeight: 48, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#dddddd', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  balanceLabel: { flex: 1, fontSize: 13 },
  balanceValue: { minWidth: 54, textAlign: 'right', fontSize: 15, fontWeight: '800' },
  balanceCount: { width: 52, textAlign: 'right', fontSize: 12 },
  legsNudge: { marginTop: 8, fontSize: 13, lineHeight: 19 },
  bestRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 7 },
  bestShareCard: { padding: 14, borderRadius: 15, gap: 4 },
  bestBrand: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  shareControl: { gap: 4 },
  shareBestButton: { minHeight: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  trendCard: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, paddingBottom: 8, gap: 8 },
  trendHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  trendLatest: { alignItems: 'flex-end' },
  trendDelta: { fontSize: 12, fontWeight: '700' },
  chart: { position: 'relative', width: '100%', overflow: 'hidden' },
  chartBase: { position: 'absolute', height: StyleSheet.hairlineWidth, left: 0, right: 0, top: 29 },
  chartSegment: { position: 'absolute', height: 2 },
  chartSegmentThin: { height: 1.5, opacity: 0.8 },
  chartEstimatePoint: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
  trendEstimate: { fontSize: 12, fontWeight: '700' },
  chartPoint: { position: 'absolute', width: 8, height: 8, borderRadius: 4, borderWidth: 2 },
  trendDates: { flexDirection: 'row', justifyContent: 'space-between' },
  trendDate: { fontSize: 11 },
  bestText: { flex: 1, gap: 3 },
  exerciseName: { fontSize: 15, fontWeight: '700' },
  bestValue: { fontSize: 16, fontWeight: '800' },
  empty: { gap: 6, paddingVertical: 10 },
  loadingCard: { minHeight: 170, alignItems: 'center', justifyContent: 'center' },
  retry: { fontWeight: '700', padding: 8 },
});
