import { displayWorkoutName } from '../src/features/session/workoutName';
import { Paged } from '../src/shared/components/paging';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../src/shared/components/Text';
import { fonts } from '../src/shared/theme/typography';
import { openExercisePage } from '../src/features/exercises/openExercise';
import { Body, Card, Chip, EmptyState, Heading, Icon, IconButton, Label, ListGroup, ListRow, PageHeading, Screen, SectionTitle, SegmentedControl, Sheet, Stepper, TextField } from '../src/shared/components/ui';
import { getExploreData } from '../src/features/analytics/repository';
import {
  availableMetrics,
  buildBreakdown,
  buildSeries,
  computeMetric,
  DEFAULT_RPE_THRESHOLD,
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
import { RepsAtLoadCard } from '../src/features/analytics/components/RepsAtLoadCard';
import { repsAtLoadFromExplore } from '../src/features/analytics/repsAtLoad';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';
import { formatMinutes, formatNumber } from '../src/shared/utils/format';
import { readPreference, writePreference } from '../src/shared/settings/preferences';
import { aggregatePairs, type PairScope } from '../src/domain/setPairs';
import type { CompletedSetRow } from '../src/features/analytics/summary';

const RPE_THRESHOLD_KEY = 'stats.threshold';
const GRANULARITIES: Granularity[] = ['workout', 'day', 'week', 'month'];
const KINDS: TrainingKind[] = ['all', 'strength', 'mobility'];
const FAMILIES: MetricFamily[] = ['counts', 'volume', 'mobility', 'performance', 'intensity'];
type SheetKind = BreakdownLevel | 'metric' | 'secondary' | null;
type ExercisePairScope = PairScope | 'compare';

type PairRow = CompletedSetRow & {
  pairId?: string | null;
  side?: string | null;
  pairMembers?: readonly PairRow[];
};

/** Select and freeze a pair scope before passing rows to metric code. The null pair id makes this
 * selection idempotent when a downstream aggregation pass is added to the explorer. */
function selectPairScope(data: ExploreData, pairScope: PairScope, exerciseId?: string): ExploreData {
  const pairedOnly = pairScope === 'average' && exerciseId && data.rows.some((row) => row.exerciseId === exerciseId && row.pairId);
  const source = pairedOnly ? data.rows.filter((row) => row.exerciseId !== exerciseId || row.pairId) : data.rows;
  const rows = aggregatePairs(source as readonly PairRow[], pairScope);
  return {
    ...data,
    rows: rows as readonly CompletedSetRow[],
  };
}

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
  const params = useLocalSearchParams<{ exerciseId?: string; metric?: string; pairScope?: string }>();
  const [data, setData] = useState<ExploreData | null>(null);
  const [failed, setFailed] = useState(false);
  const [granularity, setGranularity] = useState<Granularity>(params.exerciseId ? 'workout' : 'week');
  const [scope, setScope] = useState<Scope>({ kind: 'all' });
  const [pairScope, setPairScope] = useState<ExercisePairScope>(() => {
    if (params.pairScope === 'comparison') return 'compare';
    return ['average', 'left', 'right', 'compare', 'legacy'].includes(params.pairScope ?? '') ? params.pairScope as ExercisePairScope : 'average';
  });
  // Scopes left by drilling down, so back steps up one level instead of leaving the screen.
  const [trail, setTrail] = useState<Scope[]>([]);
  const [metric, setMetric] = useState<MetricId>('sets');
  const [secondary, setSecondary] = useState<MetricId | null>(null);
  // Shared with the training totals screen, so both count "hard" sets the same way.
  const [rpeThreshold, setRpeThreshold] = useState(() => {
    const stored = Number(readPreference(RPE_THRESHOLD_KEY));
    return stored >= 6 && stored <= 10 ? stored : DEFAULT_RPE_THRESHOLD;
  });
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

  const exerciseRows = useMemo(() => {
    if (!data || !scope.exerciseId) return [];
    return data.rows.filter((row) => row.exerciseId === scope.exerciseId) as PairRow[];
  }, [data, scope.exerciseId]);
  const hasLateralRows = exerciseRows.some((row) => row.side === 'left' || row.side === 'right' || Boolean(row.pairId));
  const hasLegacyRows = exerciseRows.some((row) => !row.pairId && (!row.side || row.side === 'both'));
  const pairOptions = useMemo<ExercisePairScope[]>(() => {
    if (!scope.exerciseId || !hasLateralRows) return ['average'];
    return hasLegacyRows ? ['average', 'left', 'right', 'compare', 'legacy'] : ['average', 'left', 'right', 'compare'];
  }, [scope.exerciseId, hasLateralRows, hasLegacyRows]);
  const activePairScope: ExercisePairScope = scope.exerciseId && pairOptions.includes(pairScope) ? pairScope : 'average';
  const viewData = useMemo(() => (data ? selectPairScope(data, activePairScope === 'compare' ? 'average' : activePairScope, scope.exerciseId) : null), [data, activePairScope, scope.exerciseId]);
  const leftData = useMemo(() => (data && activePairScope === 'compare' ? selectPairScope(data, 'left') : null), [data, activePairScope]);
  const rightData = useMemo(() => (data && activePairScope === 'compare' ? selectPairScope(data, 'right') : null), [data, activePairScope]);
  const available = useMemo(() => (viewData ? availableMetrics(viewData, scope) : []), [viewData, scope]);
  const primary = available.includes(metric) ? metric : 'sets';
  const second = secondary && secondary !== primary && available.includes(secondary) ? secondary : null;
  const now = useMemo(() => new Date(), [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const series = useMemo(() => (viewData ? buildSeries(viewData, { granularity, scope, metric: primary, now, page, rpeThreshold }) : null), [viewData, granularity, scope, primary, now, page, rpeThreshold]);
  const secondarySeries = useMemo(() => (viewData && second ? buildSeries(viewData, { granularity, scope, metric: second, now, page, rpeThreshold }) : null), [viewData, granularity, scope, second, now, page, rpeThreshold]);
  const buckets = series?.buckets ?? [];
  const selectedIndex = selected != null && selected < buckets.length ? selected : buckets.length ? lastWithData(buckets) : null;
  const bucket = selectedIndex != null ? buckets[selectedIndex] : null;
  const breakdown = useMemo(() => (viewData && bucket ? buildBreakdown(viewData, scope, primary, bucket, rpeThreshold) : []), [viewData, bucket, scope, primary, rpeThreshold]);
  const level = nextLevel(scope);
  const loadProgress = useMemo(() => viewData ? repsAtLoadFromExplore(viewData, scope) : [], [viewData, scope]);
  const comparison = useMemo(() => {
    if (activePairScope !== 'compare' || !leftData || !rightData || !series) return null;
    const values = (source: ExploreData) => series.buckets.map((bucket) => {
      const rows = source.rows.filter((row) => row.exerciseId === scope.exerciseId && bucket.workoutIds.includes(row.workoutId));
      const workouts = source.workouts.filter((row) => bucket.workoutIds.includes(row.id));
      return rows.length ? computeMetric(primary, rows, workouts, rpeThreshold) : null;
    });
    return {
      left: values(leftData),
      right: values(rightData),
    };
  }, [activePairScope, leftData, rightData, series, scope.exerciseId, primary, rpeThreshold]);

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
  const metricLabel = (id: MetricId) => t(`stats.metrics.${id}`, { value: formatNumber(rpeThreshold) });
  const changeThreshold = (value: number) => { setRpeThreshold(value); writePreference(RPE_THRESHOLD_KEY, String(value)); };
  const valueText = (id: MetricId, value: number | null | undefined) => (value == null ? t('stats.noValue') : formatMetric(id, value));
  const categoryLabel = (key: string) => t(`library.category.${key}`, { defaultValue: humanize(key) });
  const patternLabel = (key: string) => t(`movementPattern.${key}`, { defaultValue: t(`movement.groups.${key}`, { defaultValue: humanize(key) }) });
  const levelLabel = (kind: BreakdownLevel, key: string, name: string) => (kind === 'category' ? categoryLabel(key) : kind === 'pattern' ? (key ? patternLabel(key) : t('stats.noPattern')) : name);

  const resetView = () => { setPage(0); setSelected(null); };
  /** A new starting point (training kind): nothing to step back to. */
  const changeScope = (next: Scope) => { setScope(next); setPairScope('average'); setTrail([]); resetView(); };
  /** A step down (category, pattern, exercise): remembered so back can undo it. */
  const drillTo = (next: Scope) => {
    if (JSON.stringify(next) !== JSON.stringify(scope)) setTrail((steps) => [...steps, scope]);
    setScope(next);
    keepPeriod(next);
  };
  /**
   * Keeps the chosen period selected when the scope changes. Days, weeks and months sit at the same
   * place in every scope; a workout is looked up on the new scope's pages, and when it is not part
   * of that scope the view falls back to the latest period.
   */
  const keepPeriod = (next: Scope) => {
    if (!data || !bucket || selectedIndex == null) { resetView(); return; }
    if (granularity !== 'workout') { setSelected(selectedIndex); return; }
    for (let candidate = 0; candidate < 100; candidate += 1) {
      const found = buildSeries(viewData ?? data, { granularity, scope: next, metric: primary, now, page: candidate, rpeThreshold });
      const index = found.buckets.findIndex((item) => item.key === bucket.key);
      if (index >= 0) { setPage(candidate); setSelected(index); return; }
      if (!found.hasOlder) break;
    }
    resetView();
  };
  const stepBack = () => {
    const previous = trail[trail.length - 1];
    if (!previous) return false;
    setTrail(trail.slice(0, -1));
    setScope(previous);
    keepPeriod(previous);
    return true;
  };
  // The latest step-back, read by the back-button listener so it does not re-subscribe each render.
  const stepBackRef = useRef(stepBack);
  useEffect(() => { stepBackRef.current = stepBack; });
  // The phone's back button climbs the drill-down first and only then leaves the screen.
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => stepBackRef.current());
    return () => subscription.remove();
  }, []));
  const narrow = (kind: BreakdownLevel, key: string | undefined) => {
    if (kind === 'category') drillTo({ kind: scope.kind, category: key });
    else if (kind === 'pattern') drillTo({ kind: scope.kind, category: scope.category, pattern: key });
    else {
      const row = key ? data?.rows.find((candidate) => candidate.exerciseId === key) : undefined;
      if (row) setPairScope('average');
      drillTo(row ? scopeForExercise(scope, row) : { kind: scope.kind, category: scope.category, pattern: scope.pattern });
    }
    setSheet(null);
    setSearch('');
  };

  const exerciseName = scope.exerciseId ? data?.rows.find((row) => row.exerciseId === scope.exerciseId)?.exerciseName : undefined;
  const previousValue = selectedIndex != null && selectedIndex > 0 ? buckets[selectedIndex - 1].value : null;
  const options = data && (sheet === 'category' || sheet === 'pattern' || sheet === 'exercise')
    ? scopeOptions(viewData ?? data, scope, sheet).filter((option) => levelLabel(sheet, option.key, option.name).toLowerCase().includes(search.trim().toLowerCase()))
    : [];
  const choiceLevel: BreakdownLevel | null = sheet === 'category' || sheet === 'pattern' || sheet === 'exercise' ? sheet : null;
  const currentChoice = choiceLevel === 'category' ? scope.category : choiceLevel === 'pattern' ? scope.pattern : choiceLevel === 'exercise' ? scope.exerciseId : undefined;
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

        <View style={styles.chips}>
          {trail.length > 0 ? <IconButton icon="arrow-back" label={t('stats.up')} size={36} onPress={stepBack} /> : null}
          {KINDS.map((kind) => <Chip key={kind} label={t(`stats.kind.${kind}`)} selected={scope.kind === kind} onPress={() => changeScope({ kind })} />)}
        </View>
        <View style={styles.chips}>
          <Chip icon="layers-outline" label={scope.category ? categoryLabel(scope.category) : `${t('stats.category')}: ${t('stats.any')}`} selected={Boolean(scope.category)} onPress={() => setSheet('category')} />
          <Chip icon="git-branch-outline" label={scope.pattern ? patternLabel(scope.pattern) : `${t('stats.pattern')}: ${t('stats.any')}`} selected={Boolean(scope.pattern)} onPress={() => setSheet('pattern')} />
          <Chip icon="barbell-outline" label={exerciseName ?? `${t('stats.exercise')}: ${t('stats.any')}`} selected={Boolean(scope.exerciseId)} onPress={() => setSheet('exercise')} />
        </View>
        {scope.exerciseId && pairOptions.length > 1 ? (
          <View style={styles.pairScope}>
            <Label>{t('stats.pairScope.title')}</Label>
            <View style={styles.chips}>
              {pairOptions.map((option) => (
                <Chip
                  key={option}
                  label={t(`stats.pairScope.${option}`)}
                  selected={activePairScope === option}
                  onPress={() => { setPairScope(option); resetView(); }}
                />
              ))}
            </View>
          </View>
        ) : null}

        <Card>
          <View style={styles.metricRow}>
            <View style={styles.metricPick}>
              <Label>{t('stats.metric')}</Label>
              <Chip icon="stats-chart-outline" label={metricLabel(primary)} selected onPress={() => setSheet('metric')} />
            </View>
            <View style={styles.metricPick}>
              <Label>{t('stats.compare')}</Label>
              <Chip icon="pulse-outline" label={second ? metricLabel(second) : t('stats.none')} selected={Boolean(second)} onPress={() => setSheet('secondary')} />
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
              secondary={comparison ? undefined : secondarySeries?.buckets.map((item) => item.value)}
              comparison={comparison ?? undefined}
              sharedScale={Boolean(comparison)}
              labels={buckets.map(shortLabel)}
              selected={selectedIndex}
              onSelect={setSelected}
              formatPrimary={(value) => formatMetric(primary, value)}
              zeroBased={(METRIC_BY_ID[primary].family !== 'performance' && METRIC_BY_ID[primary].family !== 'intensity') || primary === 'trainingSec'}
              formatSecondary={second ? (value) => formatMetric(second, value) : undefined}
              accessibilityLabel={(index) => comparison
                ? `${periodTitle(buckets[index])}: L ${valueText(primary, comparison.left[index])}, R ${valueText(primary, comparison.right[index])}`
                : `${periodTitle(buckets[index])}: ${valueText(primary, buckets[index].value)}`}
            />
          )}
          {primary === 'setsAtRpe' || second === 'setsAtRpe' ? (
            <View style={styles.thresholdBox}>
              <Stepper layout="row" label={t('stats.rpeThreshold')} value={rpeThreshold} display={`≥ RPE ${formatNumber(rpeThreshold)}`} step={0.5} min={6} max={10} onChange={changeThreshold} />
              <Body style={styles.legendText}>{t('stats.rpeHint')}</Body>
            </View>
          ) : null}
          {comparison ? (
            <View style={styles.legend}>
              <View style={[styles.legendLine, { backgroundColor: palette.record }]} /><Body style={styles.legendText}>L · {metricLabel(primary)}</Body>
              <View style={[styles.legendLine, { backgroundColor: palette.accentStrong }]} /><Body style={styles.legendText}>R · {metricLabel(primary)}</Body>
            </View>
          ) : second ? (
            <View style={styles.legend}>
              <View style={[styles.legendSwatch, { backgroundColor: palette.accent }]} /><Body style={styles.legendText}>{metricLabel(primary)}</Body>
              <View style={[styles.legendLine, { backgroundColor: palette.record }]} /><Body style={styles.legendText}>{metricLabel(second)}</Body>
            </View>
          ) : null}
        </Card>

        {bucket && bucket.workoutIds.length > 0 ? (
          <Card>
            <Label>{periodTitle(bucket)}</Label>
            <View style={styles.totals}>
              <View style={styles.total}>
                <Text style={[styles.totalValue, { color: palette.accentStrong }]}>{valueText(primary, bucket.value)}</Text>
                <Body style={styles.totalLabel}>{metricLabel(primary)}</Body>
              </View>
              {second ? (
                <View style={styles.total}>
                  <Text style={[styles.totalValue, { color: palette.record }]}>{valueText(second, secondarySeries?.buckets[selectedIndex!]?.value)}</Text>
                  <Body style={styles.totalLabel}>{metricLabel(second)}</Body>
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
                    onLongPress={level === 'exercise' && item.key ? () => openExercisePage(item.key) : undefined}
                    style={({ pressed }) => [styles.breakdownRow, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <View style={styles.breakdownCopy}>
                      <View style={styles.breakdownHead}>
                        <Text style={[styles.breakdownName, { color: palette.text }]}>{label}</Text>
                        <Text style={[styles.breakdownValue, { color: palette.text }]}>{value}</Text>
                      </View>
                      <View style={[styles.breakdownTrack, { backgroundColor: palette.surfaceMuted }]}>
                        <View style={[styles.breakdownFill, { width: `${Math.max(4, (item.value / breakdown[0].value) * 100)}%`, backgroundColor: palette.accent }]} />
                      </View>
                    </View>
                    <View style={styles.breakdownChevron}>{open ? <Icon name="chevron-forward" size={16} color={palette.textMuted} /> : null}</View>
                  </Pressable>
                );
              })}
            </> : null}

            <SectionTitle title={t('stats.workouts')} />
            <ListGroup>
              <Paged items={bucketWorkouts} pageSize={20} resetKey={bucketWorkouts[0]?.id}>{(shownWorkouts) => shownWorkouts.map((workout) => (
                <ListRow
                  key={workout.id}
                  icon="barbell-outline"
                  title={displayWorkoutName(workout.name, t('log.pastName'))}
                  subtitle={dateFormat({ weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }, workout.startedAt)}
                  onPress={() => router.push({ pathname: '/workout/history/[id]', params: { id: workout.id } })}
                />
              ))}</Paged>
            </ListGroup>
          </Card>
        ) : buckets.some((item) => item.workoutIds.length) ? <Body>{t('stats.selectHint')}</Body> : null}
        {scope.exerciseId && loadProgress.length > 0 ? <RepsAtLoadCard key={scope.exerciseId} groups={loadProgress} /> : null}
      </>}

      <Sheet visible={sheet === 'category' || sheet === 'pattern' || sheet === 'exercise'} onClose={() => { setSheet(null); setSearch(''); }} title={sheet ? t(`stats.${sheet === 'metric' || sheet === 'secondary' ? 'metric' : sheet}`) : ''}>
        <TextField placeholder={t('stats.search')} value={search} onChangeText={setSearch} />
        {choiceLevel ? (
          <ListGroup>
            <ListRow title={t('stats.any')} selected={!currentChoice} onPress={() => narrow(choiceLevel, undefined)} />
            {options.map((option) => (
              <ListRow
                key={option.key}
                title={levelLabel(choiceLevel, option.key, option.name)}
                subtitle={`${option.sets} ${t('stats.metrics.sets').toLowerCase()}`}
                selected={option.key === currentChoice}
                onPress={() => narrow(choiceLevel, option.key)}
                onLongPress={choiceLevel === 'exercise' ? () => { setSheet(null); openExercisePage(option.key); } : undefined}
                longPressLabel={t('logger.openExercise')}
              />
            ))}
          </ListGroup>
        ) : null}
        {options.length === 0 && search.trim() ? <Body>{t('stats.noMatches')}</Body> : null}
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
                    label={metricLabel(id)}
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
  pairScope: { gap: 6 },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricPick: { gap: 6, flexShrink: 1 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pagerSpacer: { width: 48, height: 48 },
  pagerRange: { flex: 1, textAlign: 'center', fontSize: 13 },
  thresholdBox: { gap: 4 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendLine: { width: 14, height: 2, marginLeft: 8 },
  legendText: { fontSize: 12 },
  totals: { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
  total: { flexShrink: 1, gap: 4 },
  totalValue: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, fontVariant: ['tabular-nums'] },
  totalLabel: { fontSize: 14, lineHeight: 20 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10 },
  breakdownCopy: { flex: 1, gap: 8 },
  breakdownHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 },
  breakdownName: { flexGrow: 1, flexShrink: 1, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  breakdownTrack: { height: 6, borderRadius: 4, overflow: 'hidden' },
  breakdownFill: { height: '100%', borderRadius: 4 },
  breakdownValue: { textAlign: 'right', fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  breakdownChevron: { width: 16, alignItems: 'center' },
  family: { gap: 6, marginBottom: 6 },
});
