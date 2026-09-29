import { useCallback, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../src/shared/components/Text';
import { Body, Card, Chip, EmptyState, Heading, Icon, IconButton, Label, ListGroup, ListRow, PageHeading, Screen, SectionTitle, SegmentedControl, Sheet, TextField } from '../src/shared/components/ui';
import { getExploreData } from '../src/features/analytics/repository';
import {
  availableMetrics,
  buildBreakdown,
  buildSeries,
  METRIC_BY_ID,
  METRICS,
  nextLevel,
  scopeForExercise,
  scopeOptions,
  type BreakdownLevel,
  type Bucket,
  type ExploreData,
  type Granularity,
  type MetricFamily,
  type MetricId,
  type Scope,
  type TrainingKind,
} from '../src/features/analytics/explore';
import { StatsChart } from '../src/features/analytics/components/StatsChart';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';
import { formatMinutes, formatNumber } from '../src/shared/utils/format';

const GRANULARITIES: Granularity[] = ['workout', 'day', 'week', 'month'];
const KINDS: TrainingKind[] = ['all', 'strength', 'mobility'];
const FAMILIES: MetricFamily[] = ['counts', 'volume', 'mobility', 'performance', 'intensity'];
type SheetKind = BreakdownLevel | 'metric' | 'secondary' | null;

function formatMetric(metric: MetricId, value: number): string {
  switch (METRIC_BY_ID[metric].unit) {
    case 'count':
    case 'reps': return formatNumber(Math.round(value * 10) / 10);
    case 'seconds': return formatMinutes(value);
    case 'meters': return `${formatNumber(value)} m`;
    case 'kgReps': return `${formatNumber(value)} kg·rep`;
    case 'kgSeconds': return `${formatNumber(value)} kg·s`;
    case 'kg': return `${formatNumber(value)} kg`;
    case 'score': return value.toFixed(1);
  }
}

export default function StatsScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const params = useLocalSearchParams<{ exerciseId?: string; metric?: string }>();
  const [data, setData] = useState<ExploreData | null>(null);
  const [failed, setFailed] = useState(false);
  const [granularity, setGranularity] = useState<Granularity>(params.exerciseId ? 'workout' : 'week');
  const [scope, setScope] = useState<Scope>({ kind: 'all' });
  // Scopes left by drilling down, so back steps up one level instead of leaving the screen.
  const [trail, setTrail] = useState<Scope[]>([]);
  const [metric, setMetric] = useState<MetricId>('sets');
  const [secondary, setSecondary] = useState<MetricId | null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [search, setSearch] = useState('');
  const appliedParams = useRef(false);

  const load = useCallback(() => {
    let active = true;
    setFailed(false);
    getExploreData().then((result) => {
      if (!active) return;
      setData(result);
      // A deep link (e.g. from an exercise trend) opens the explorer on that exercise and metric, once.
      if (appliedParams.current) return;
      appliedParams.current = true;
      const row = params.exerciseId ? result.rows.find((candidate) => candidate.exerciseId === params.exerciseId) : undefined;
      if (!row) return;
      setScope(scopeForExercise({ kind: 'all' }, row));
      if (params.metric && params.metric in METRIC_BY_ID) setMetric(params.metric as MetricId);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [params.exerciseId, params.metric]);
  useFocusEffect(load);

  const available = useMemo(() => (data ? availableMetrics(data, scope) : []), [data, scope]);
  const primary = available.includes(metric) ? metric : 'sets';
  const second = secondary && secondary !== primary && available.includes(secondary) ? secondary : null;
  const now = useMemo(() => new Date(), [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const series = useMemo(() => (data ? buildSeries(data, { granularity, scope, metric: primary, now, page }) : null), [data, granularity, scope, primary, now, page]);
  const secondarySeries = useMemo(() => (data && second ? buildSeries(data, { granularity, scope, metric: second, now, page }) : null), [data, granularity, scope, second, now, page]);
  const buckets = series?.buckets ?? [];
  const selectedIndex = selected != null && selected < buckets.length ? selected : buckets.length ? lastWithData(buckets) : null;
  const bucket = selectedIndex != null ? buckets[selectedIndex] : null;
  const breakdown = useMemo(() => (data && bucket ? buildBreakdown(data, scope, primary, bucket) : []), [data, bucket, scope, primary]);
  const level = nextLevel(scope);

  const locale = i18n.language;
  const dateFormat = (options: Intl.DateTimeFormatOptions, date: Date) => new Intl.DateTimeFormat(locale, options).format(date);
  const shortLabel = (item: Bucket) => {
    if (granularity === 'month') return dateFormat(item.start.getMonth() === 0 ? { month: 'short', year: '2-digit' } : { month: 'short' }, item.start);
    if (granularity === 'week') return dateFormat({ day: 'numeric', month: 'short' }, item.start);
    return dateFormat({ day: 'numeric', month: 'numeric' }, item.start);
  };
  const periodTitle = (item: Bucket) => {
    if (granularity === 'workout') return `${data?.workouts.find((workout) => workout.id === item.key)?.name ?? ''} · ${dateFormat({ weekday: 'short', day: 'numeric', month: 'short' }, item.start)}`;
    if (granularity === 'day') return dateFormat({ weekday: 'long', day: 'numeric', month: 'long' }, item.start);
    if (granularity === 'week') return `${dateFormat({ day: 'numeric', month: 'short' }, item.start)} – ${dateFormat({ day: 'numeric', month: 'short', year: 'numeric' }, new Date(item.end.getTime() - 1))}`;
    return dateFormat({ month: 'long', year: 'numeric' }, item.start);
  };
  const valueText = (id: MetricId, value: number | null | undefined) => (value == null ? t('stats.noValue') : formatMetric(id, value));
  const categoryLabel = (key: string) => t(`library.category.${key}`, { defaultValue: humanize(key) });
  const patternLabel = (key: string) => t(`movementPattern.${key}`, { defaultValue: humanize(key) });
  const levelLabel = (kind: BreakdownLevel, key: string, name: string) => (kind === 'category' ? categoryLabel(key) : kind === 'pattern' ? (key ? patternLabel(key) : t('stats.noPattern')) : name);

  const resetView = () => { setPage(0); setSelected(null); };
  /** A new starting point (training kind): nothing to step back to. */
  const changeScope = (next: Scope) => { setScope(next); setTrail([]); resetView(); };
  /** A step down (category, pattern, exercise): remembered so back can undo it. */
  const drillTo = (next: Scope) => {
    if (JSON.stringify(next) !== JSON.stringify(scope)) setTrail((steps) => [...steps, scope]);
    setScope(next);
    resetView();
  };
  const stepBack = useCallback(() => {
    const previous = trail[trail.length - 1];
    if (!previous) return false;
    setTrail(trail.slice(0, -1));
    setScope(previous);
    setPage(0);
    setSelected(null);
    return true;
  }, [trail]);
  // The phone's back button climbs the drill-down first and only then leaves the screen.
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', stepBack);
    return () => subscription.remove();
  }, [stepBack]));
  const narrow = (kind: BreakdownLevel, key: string | undefined) => {
    if (kind === 'category') drillTo({ kind: scope.kind, category: key });
    else if (kind === 'pattern') drillTo({ kind: scope.kind, category: scope.category, pattern: key });
    else {
      const row = key ? data?.rows.find((candidate) => candidate.exerciseId === key) : undefined;
      drillTo(row ? scopeForExercise(scope, row) : { kind: scope.kind, category: scope.category, pattern: scope.pattern });
    }
    setSheet(null);
    setSearch('');
  };

  const exerciseName = scope.exerciseId ? data?.rows.find((row) => row.exerciseId === scope.exerciseId)?.exerciseName : undefined;
  const previousValue = selectedIndex != null && selectedIndex > 0 ? buckets[selectedIndex - 1].value : null;
  const options = data && (sheet === 'category' || sheet === 'pattern' || sheet === 'exercise')
    ? scopeOptions(data, scope, sheet).filter((option) => levelLabel(sheet, option.key, option.name).toLowerCase().includes(search.trim().toLowerCase()))
    : [];
  const bucketWorkouts = data && bucket ? data.workouts.filter((workout) => bucket.workoutIds.includes(workout.id)).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()) : [];

  return (
    <Screen>
      <PageHeading title={t('stats.title')} subtitle={t('stats.subtitle')} />
      {!data ? (
        <Card style={styles.loading}>
          {failed ? <>
            <Heading>{t('stats.error')}</Heading>
            <Text onPress={load} style={[styles.link, { color: palette.accentStrong }]} accessibilityRole="button">{t('stats.retry')}</Text>
          </> : <><ActivityIndicator color={palette.accentStrong} /><Body>{t('stats.loading')}</Body></>}
        </Card>
      ) : <>
        <SegmentedControl value={granularity} options={GRANULARITIES.map((value) => ({ value, label: t(`stats.granularity.${value}`) }))} onChange={(value) => { setGranularity(value); resetView(); }} />

        {trail.length > 0 ? <View style={styles.chips}><Chip icon="arrow-back" label={t('stats.up')} onPress={stepBack} /></View> : null}
        <View style={styles.chips}>
          {KINDS.map((kind) => <Chip key={kind} label={t(`stats.kind.${kind}`)} selected={scope.kind === kind} onPress={() => changeScope({ kind })} />)}
        </View>
        <View style={styles.chips}>
          <Chip icon="layers-outline" label={scope.category ? categoryLabel(scope.category) : `${t('stats.category')}: ${t('stats.any')}`} selected={Boolean(scope.category)} onPress={() => setSheet('category')} />
          <Chip icon="git-branch-outline" label={scope.pattern ? patternLabel(scope.pattern) : `${t('stats.pattern')}: ${t('stats.any')}`} selected={Boolean(scope.pattern)} onPress={() => setSheet('pattern')} />
          <Chip icon="barbell-outline" label={exerciseName ?? `${t('stats.exercise')}: ${t('stats.any')}`} selected={Boolean(scope.exerciseId)} onPress={() => setSheet('exercise')} />
        </View>

        <Card>
          <View style={styles.metricRow}>
            <View style={styles.metricPick}>
              <Label>{t('stats.metric')}</Label>
              <Chip icon="stats-chart-outline" label={t(`stats.metrics.${primary}`)} selected onPress={() => setSheet('metric')} />
            </View>
            <View style={styles.metricPick}>
              <Label>{t('stats.compare')}</Label>
              <Chip icon="pulse-outline" label={second ? t(`stats.metrics.${second}`) : t('stats.none')} selected={Boolean(second)} onPress={() => setSheet('secondary')} />
            </View>
          </View>

          <View style={styles.pager}>
            {series?.hasOlder ? <IconButton icon="chevron-back" label={t('stats.older')} onPress={() => { setPage(page + 1); setSelected(null); }} /> : <View style={styles.pagerSpacer} />}
            <Body style={styles.pagerRange}>{buckets.length ? `${shortLabel(buckets[0])} – ${shortLabel(buckets[buckets.length - 1])}` : ''}</Body>
            {page > 0 ? <IconButton icon="chevron-forward" label={t('stats.newer')} onPress={() => { setPage(page - 1); setSelected(null); }} /> : <View style={styles.pagerSpacer} />}
          </View>

          {buckets.length === 0 || buckets.every((item) => item.workoutIds.length === 0) ? (
            <EmptyState icon="stats-chart-outline" title={t('stats.emptyTitle')} body={t('stats.emptyBody')} />
          ) : (
            <StatsChart
              values={buckets.map((item) => item.value)}
              secondary={secondarySeries?.buckets.map((item) => item.value)}
              labels={buckets.map(shortLabel)}
              selected={selectedIndex}
              onSelect={setSelected}
              formatPrimary={(value) => formatMetric(primary, value)}
              zeroBased={(METRIC_BY_ID[primary].family !== 'performance' && METRIC_BY_ID[primary].family !== 'intensity') || primary === 'trainingSec'}
              formatSecondary={second ? (value) => formatMetric(second, value) : undefined}
              accessibilityLabel={(index) => `${periodTitle(buckets[index])}: ${valueText(primary, buckets[index].value)}`}
            />
          )}
          {second ? (
            <View style={styles.legend}>
              <View style={[styles.legendSwatch, { backgroundColor: palette.accent }]} /><Body style={styles.legendText}>{t(`stats.metrics.${primary}`)}</Body>
              <View style={[styles.legendLine, { backgroundColor: palette.record }]} /><Body style={styles.legendText}>{t(`stats.metrics.${second}`)}</Body>
            </View>
          ) : null}
        </Card>

        {bucket && bucket.workoutIds.length > 0 ? (
          <Card>
            <Label>{periodTitle(bucket)}</Label>
            <View style={styles.totals}>
              <View style={styles.total}>
                <Text style={[styles.totalValue, { color: palette.accentStrong }]}>{valueText(primary, bucket.value)}</Text>
                <Body style={styles.totalLabel}>{t(`stats.metrics.${primary}`)}</Body>
              </View>
              {second ? (
                <View style={styles.total}>
                  <Text style={[styles.totalValue, { color: palette.record }]}>{valueText(second, secondarySeries?.buckets[selectedIndex!]?.value)}</Text>
                  <Body style={styles.totalLabel}>{t(`stats.metrics.${second}`)}</Body>
                </View>
              ) : null}
            </View>
            <Body>{t('stats.previous', { value: valueText(primary, previousValue) })}{bucket.value != null && previousValue ? `  (${delta(bucket.value, previousValue)})` : ''}</Body>

            {level && breakdown.length > 0 ? <>
              <SectionTitle title={t(`stats.breakdown.${level}`)} />
              {breakdown.map((item) => {
                const label = levelLabel(level, item.key, item.name);
                const value = `${formatMetric(primary, item.value)}${item.share != null ? ` · ${Math.round(item.share * 100)}%` : ''}`;
                const open = Boolean(item.key);
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${label}: ${value}`}
                    accessibilityState={{ disabled: !open }}
                    disabled={!open}
                    onPress={() => narrow(level, item.key)}
                    style={({ pressed }) => [styles.breakdownRow, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Text numberOfLines={2} style={[styles.breakdownName, { color: palette.text }]}>{label}</Text>
                    <View style={[styles.breakdownTrack, { backgroundColor: palette.surfaceMuted }]}>
                      <View style={[styles.breakdownFill, { width: `${Math.max(4, (item.value / breakdown[0].value) * 100)}%`, backgroundColor: palette.accent }]} />
                    </View>
                    <Text style={[styles.breakdownValue, { color: palette.text }]}>{value}</Text>
                    <View style={styles.breakdownChevron}>{open ? <Icon name="chevron-forward" size={16} color={palette.textMuted} /> : null}</View>
                  </Pressable>
                );
              })}
            </> : null}

            <SectionTitle title={t('stats.workouts')} />
            <ListGroup>
              {bucketWorkouts.map((workout) => (
                <ListRow
                  key={workout.id}
                  icon="barbell-outline"
                  title={workout.name}
                  subtitle={dateFormat({ weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }, workout.startedAt)}
                  onPress={() => router.push({ pathname: '/workout/history/[id]', params: { id: workout.id } })}
                />
              ))}
            </ListGroup>
          </Card>
        ) : buckets.some((item) => item.workoutIds.length) ? <Body>{t('stats.selectHint')}</Body> : null}
      </>}

      <Sheet visible={sheet === 'category' || sheet === 'pattern' || sheet === 'exercise'} onClose={() => { setSheet(null); setSearch(''); }} title={sheet ? t(`stats.${sheet === 'metric' || sheet === 'secondary' ? 'metric' : sheet}`) : ''}>
        <TextField placeholder={t('stats.search')} value={search} onChangeText={setSearch} />
        <ListGroup>
          <ListRow icon="close-circle-outline" title={t('stats.clear')} onPress={() => sheet && sheet !== 'metric' && sheet !== 'secondary' && narrow(sheet, undefined)} />
          {options.map((option) => (
            <ListRow
              key={option.key}
              title={sheet && sheet !== 'metric' && sheet !== 'secondary' ? levelLabel(sheet, option.key, option.name) : option.name}
              subtitle={`${option.sets} ${t('stats.metrics.sets').toLowerCase()}`}
              onPress={() => sheet && sheet !== 'metric' && sheet !== 'secondary' && narrow(sheet, option.key)}
            />
          ))}
        </ListGroup>
      </Sheet>

      <Sheet visible={sheet === 'metric' || sheet === 'secondary'} onClose={() => setSheet(null)} title={sheet === 'secondary' ? t('stats.compare') : t('stats.metric')} body={scope.exerciseId ? undefined : t('stats.performanceHint')}>
        {sheet === 'secondary' ? <View style={styles.chips}><Chip label={t('stats.none')} selected={!second} onPress={() => { setSecondary(null); setSheet(null); }} /></View> : null}
        {FAMILIES.map((family) => {
          const ids = METRICS.filter((item) => item.family === family && available.includes(item.id) && (sheet !== 'secondary' || item.id !== primary)).map((item) => item.id);
          if (!ids.length) return null;
          return (
            <View key={family} style={styles.family}>
              <Label>{t(`stats.family.${family}`)}</Label>
              <View style={styles.chips}>
                {ids.map((id) => (
                  <Chip
                    key={id}
                    label={t(`stats.metrics.${id}`)}
                    selected={sheet === 'secondary' ? second === id : primary === id}
                    onPress={() => { if (sheet === 'secondary') setSecondary(id); else setMetric(id); setSheet(null); }}
                  />
                ))}
              </View>
            </View>
          );
        })}
      </Sheet>
    </Screen>
  );
}

function lastWithData(buckets: readonly Bucket[]): number {
  for (let index = buckets.length - 1; index >= 0; index -= 1) if (buckets[index].workoutIds.length) return index;
  return buckets.length - 1;
}

function delta(value: number, previous: number): string {
  const change = ((value - previous) / previous) * 100;
  return `${change > 0 ? '+' : ''}${Math.round(change)}%`;
}

function humanize(key: string): string {
  const text = key.replace(/[-_]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const baseStyles = StyleSheet.create({
  loading: { minHeight: 170, alignItems: 'center', justifyContent: 'center' },
  link: { fontWeight: '700', padding: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricPick: { gap: 6, flexShrink: 1 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pagerSpacer: { width: 40, height: 40 },
  pagerRange: { flex: 1, textAlign: 'center', fontSize: 13 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendLine: { width: 14, height: 2, marginLeft: 8 },
  legendText: { fontSize: 12 },
  totals: { flexDirection: 'row', gap: 24 },
  total: { gap: 2 },
  totalValue: { fontSize: 26, fontWeight: '800' },
  totalLabel: { fontSize: 12 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  breakdownName: { width: '34%', fontSize: 13, fontWeight: '600' },
  breakdownTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  breakdownFill: { height: '100%', borderRadius: 4 },
  breakdownValue: { minWidth: 64, textAlign: 'right', fontSize: 12, fontWeight: '700' },
  breakdownChevron: { width: 16, alignItems: 'center' },
  family: { gap: 6, marginBottom: 6 },
});
