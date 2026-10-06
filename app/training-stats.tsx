import { Paged } from '../src/shared/components/paging';
import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { openExercisePage } from '../src/features/exercises/openExercise';
import { ActionButton, Body, Card, Chip, Heading, IconButton, PageHeading, Screen, SegmentedControl, Stepper } from '../src/shared/components/ui';
import { Text } from '../src/shared/components/Text';
import { getTrainingStatsRows } from '../src/features/analytics/repository';
import { buildTrainingStats, OTHER_ID, type StatsDimension, type StatsMetrics, type StatsScope, type StatsPeriodKind, type StatsSetRow } from '../src/features/analytics/trainingStats';
import { formatPeriod, formatPeriodShort } from '../src/features/analytics/periodLabels';
import { PeriodBars } from '../src/features/analytics/PeriodBars';
import { movementTagLabel } from '../src/features/exercises/ClassificationChoices';
import { readPreference, writePreference } from '../src/shared/settings/preferences';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';
import { formatDuration, formatNumber } from '../src/shared/utils/format';


type StatsView = 'pattern' | 'exercise';
type PatternKind = 'group' | 'tag';
type MainScope = 'all' | 'strength' | 'mobility';
type MobilityKind = 'all' | 'active' | 'passive';
const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  const value = readPreference(key);
  return allowed.includes(value as T) ? (value as T) : fallback;
};

export default function StatsScreen() {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.language.toLowerCase().startsWith('it') ? 'it' : 'en';
  const [rows, setRows] = useState<StatsSetRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<StatsView>(() => pick('stats.view', ['pattern', 'exercise'], 'pattern'));
  const [patternKind, setPatternKind] = useState<PatternKind>(() => pick('stats.patternKind', ['group', 'tag'], 'group'));
  const [periodKind, setPeriodKind] = useState<StatsPeriodKind>(() => pick('stats.period', ['session', 'day', 'week', 'month'], 'week'));
  const [threshold, setThreshold] = useState(() => {
    const stored = Number(readPreference('stats.threshold'));
    return stored >= 6 && stored <= 10 ? stored : 8;
  });
  const [rpeOnly, setRpeOnly] = useState(() => readPreference('stats.rpeOnly') === 'true');
  const [mainScope, setMainScope] = useState<MainScope>(() => pick('stats.scope', ['all', 'strength', 'mobility'], 'all'));
  const [mobilityKind, setMobilityKind] = useState<MobilityKind>(() => pick('stats.mobilityKind', ['all', 'active', 'passive'], 'all'));
  const [anchor, setAnchor] = useState<string | null>(null);

  const load = useCallback(() => {
    let active = true;
    setFailed(false);
    getTrainingStatsRows().then((result) => { if (active) setRows(result); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  useFocusEffect(load);

  const dimension: StatsDimension = view === 'exercise' ? 'exercise' : patternKind;
  const scope: StatsScope = mainScope === 'mobility' && mobilityKind !== 'all' ? `mobility-${mobilityKind}` : mainScope;
  const stats = useMemo(() => rows ? buildTrainingStats(rows, { dimension, period: periodKind, anchor, threshold, rpeOnly, scope }) : null, [rows, dimension, periodKind, anchor, threshold, rpeOnly, scope]);

  function remember<T extends string>(key: string, setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      writePreference(key, value);
    };
  }
  const changeThreshold = (value: number) => { setThreshold(value); writePreference('stats.threshold', String(value)); };
  const changeRpeOnly = (value: 'all' | 'rpe') => { setRpeOnly(value === 'rpe'); writePreference('stats.rpeOnly', String(value === 'rpe')); };
  const rpeLabel = `RPE ≥ ${formatNumber(threshold)}`;

  const itemName = (id: string, name: string) => {
    if (dimension === 'exercise') return name;
    if (id === OTHER_ID) return dimension === 'tag' ? t('trainingStats.untagged') : t('trainingStats.other');
    return dimension === 'group' ? t(`movement.groups.${id}`) : movementTagLabel(id, t);
  };
  const maxSets = Math.max(1, ...(stats?.items.map((item) => item.metrics.sets) ?? [1]));

  return <Screen>
    <PageHeading title={t('trainingStats.title')} subtitle={t('trainingStats.subtitle')} />
    <View style={styles.controls}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {(['all', 'strength', 'mobility'] as const).map((value) => <Chip key={value} label={t(value === 'all' ? 'trainingStats.scopeAll' : value === 'strength' ? 'trainingStats.scopeStrength' : 'trainingStats.scopeMobility')} selected={mainScope === value} onPress={() => remember<MainScope>('stats.scope', setMainScope)(value)} />)}
      </ScrollView>
      {mainScope === 'mobility' && <View style={styles.quietToggle}>
        {(['all', 'active', 'passive'] as const).map((kind, index) => <View key={kind} style={styles.quietItem}>
          {index > 0 && <Text style={{ color: palette.textMuted }}>·</Text>}
          <Pressable accessibilityRole="button" accessibilityState={{ selected: mobilityKind === kind }} hitSlop={10} onPress={() => remember<MobilityKind>('stats.mobilityKind', setMobilityKind)(kind)}>
            <Text style={[styles.quietText, { color: mobilityKind === kind ? palette.text : palette.textMuted, fontFamily: mobilityKind === kind ? 'Barlow_600SemiBold' : undefined }]}>{kind === 'all' ? t('trainingStats.modeAll') : kind === 'active' ? t('trainingStats.modeActive') : t('trainingStats.modePassive')}</Text>
          </Pressable>
        </View>)}
      </View>}
      <SegmentedControl<StatsView> value={view} onChange={remember<StatsView>('stats.view', setView)} options={[{ value: 'pattern', label: t('trainingStats.pattern') }, { value: 'exercise', label: t('trainingStats.exercise') }]} />
      {view === 'pattern' && <View style={styles.quietToggle}>
        {(['group', 'tag'] as const).map((kind, index) => <View key={kind} style={styles.quietItem}>
          {index > 0 && <Text style={{ color: palette.textMuted }}>·</Text>}
          <Pressable accessibilityRole="button" accessibilityState={{ selected: patternKind === kind }} hitSlop={10} onPress={() => remember<PatternKind>('stats.patternKind', setPatternKind)(kind)}>
            <Text style={[styles.quietText, { color: patternKind === kind ? palette.text : palette.textMuted, fontFamily: patternKind === kind ? 'Barlow_600SemiBold' : undefined }]}>{kind === 'group' ? t('trainingStats.groups') : t('trainingStats.tags')}</Text>
          </Pressable>
        </View>)}
      </View>}
      <SegmentedControl<StatsPeriodKind> value={periodKind} onChange={(value) => { remember<StatsPeriodKind>('stats.period', setPeriodKind)(value); setAnchor(null); }} options={(['session', 'day', 'week', 'month'] as const).map((value) => ({ value, label: t(`trainingStats.${value}`) }))} />
      <SegmentedControl<'all' | 'rpe'> value={rpeOnly ? 'rpe' : 'all'} onChange={changeRpeOnly} options={[{ value: 'all', label: t('trainingStats.allSets') }, { value: 'rpe', label: rpeLabel }]} />
      {rpeOnly && <Stepper layout="row" label={t('trainingStats.threshold')} value={threshold} step={0.5} min={6} max={10} onChange={changeThreshold} />}
    </View>

    {!stats ? <Card style={styles.loadingCard}>
      {failed ? <><Heading>{t('trainingStats.error')}</Heading><ActionButton label={t('trainingStats.retry')} secondary onPress={() => { load(); }} /></>
        : <><ActivityIndicator color={palette.accentStrong} /><Body>{t('trainingStats.loading')}</Body></>}
    </Card> : !stats.period ? <Card><Body>{t('trainingStats.noData')}</Body></Card> : <>
      <Card>
        <View style={styles.navigator}>
          <IconButton icon="chevron-back" label={t('trainingStats.previous')} disabled={!stats.olderId} onPress={() => stats.olderId && setAnchor(stats.olderId)} />
          <Text numberOfLines={1} accessibilityLiveRegion="polite" style={[styles.periodLabel, { color: palette.text }]}>{formatPeriod(stats.period, periodKind, locale)}</Text>
          <IconButton icon="chevron-forward" label={t('trainingStats.next')} disabled={!stats.newerId} onPress={() => stats.newerId && setAnchor(stats.newerId)} />
        </View>
        {stats.newerId && <Pressable accessibilityRole="button" onPress={() => setAnchor(null)} style={styles.latest}>
          <Text style={[styles.latestText, { color: palette.accentStrong }]}>{periodKind === 'session' ? t('trainingStats.latestSession') : t('trainingStats.today')}</Text>
        </Pressable>}
        <PeriodBars
          bars={stats.history}
          selectedId={stats.period.id}
          onSelect={setAnchor}
          describe={(bar) => `${formatPeriodShort(bar.start, periodKind, locale)}: ${t('trainingStats.setsCount', { count: bar.sets })}`}
          firstLabel={stats.history.length ? formatPeriodShort(stats.history[0].start, periodKind, locale) : ''}
          lastLabel={stats.history.length ? formatPeriodShort(stats.history[stats.history.length - 1].start, periodKind, locale) : ''}
        />
        <View style={styles.summary}>
          <Text style={[styles.summaryValue, { color: palette.text }]}>{stats.summary.sets}</Text>
          <Text style={[styles.summaryUnit, { color: palette.textMuted }]}>{t('trainingStats.setsUnit', { count: stats.summary.sets })}</Text>
        </View>
        {detail(stats.summary, threshold, t, rpeOnly) ? <Body>{detail(stats.summary, threshold, t, rpeOnly)}</Body> : null}
      </Card>

      <Card>
        {dimension === 'tag' && stats.items.length > 0 ? <Body>{t('exerciseGrouping.statsHint')}</Body> : null}
        {stats.items.length === 0 ? <Body>{mainScope === 'mobility' ? t('trainingStats.emptyMobility') : mainScope === 'strength' ? t('trainingStats.emptyStrength') : t('trainingStats.empty')}</Body> : <Paged items={stats.items} pageSize={20} resetKey={`${dimension}:${mainScope}`}>{(shownItems) => shownItems.map((item, index) => <Pressable key={item.id} accessible={false} accessibilityRole="none" onLongPress={dimension === 'exercise' && item.id !== OTHER_ID ? () => openExercisePage(item.id) : undefined} style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }]}>
          <View style={styles.rowHead}>
            <Text numberOfLines={1} style={[styles.rowName, { color: palette.text }]}>{itemName(item.id, item.name)}</Text>
            <Text style={[styles.rowValue, { color: palette.text }]}>{mainScope === 'mobility' && item.metrics.holdSeconds > 0 ? formatDuration(item.metrics.holdSeconds) : item.metrics.sets}</Text>
          </View>
          <View style={[styles.rowBar, { width: `${Math.max(3, (item.metrics.sets / maxSets) * 100)}%`, backgroundColor: palette.accentSoft }]} />
          {detail(item.metrics, threshold, t, rpeOnly) ? <Text style={[styles.rowDetail, { color: palette.textMuted }]}>{detail(item.metrics, threshold, t, rpeOnly)}</Text> : null}
        </Pressable>)}</Paged>}
      </Card>

    </>}
  </Screen>;
}

/** Only the non-zero parts, e.g. "48 rip · 2 ≥ RPE 8 · 120 kg·rep". Empty string when nothing to add. */
function detail(metrics: StatsMetrics, threshold: number, t: TFunction, rpeOnly: boolean): string {
  return [
    metrics.reps > 0 ? t('trainingStats.repsCount', { count: metrics.reps }) : null,
    metrics.holdSeconds > 0 ? formatDuration(metrics.holdSeconds) : null,
    !rpeOnly && metrics.setsAtThreshold > 0 ? `${metrics.setsAtThreshold} ≥ RPE ${formatNumber(threshold)}` : null,
    metrics.loadRepsKg > 0 ? `${formatNumber(metrics.loadRepsKg)} kg·rep` : null,
    metrics.loadSecondsKg > 0 ? `${formatNumber(metrics.loadSecondsKg)} kg·s` : null,
  ].filter((part): part is string => part !== null).join(' · ');
}

const baseStyles = StyleSheet.create({
  controls: { gap: 12, marginBottom: 4 },
  chipRow: { gap: 8, paddingRight: 4 },
  quietToggle: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  quietItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quietText: { fontSize: 14, paddingVertical: 12 },
  loadingCard: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 10 },
  navigator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  periodLabel: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: 'Barlow_600SemiBold' },
  latest: { alignSelf: 'center', minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, marginBottom: 4 },
  latestText: { fontSize: 13, fontFamily: 'Barlow_600SemiBold' },
  summary: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 14 },
  summaryValue: { fontSize: 40, lineHeight: 44, fontFamily: 'BarlowCondensed_700Bold', fontVariant: ['tabular-nums'] },
  summaryUnit: { fontSize: 15 },
  row: { paddingVertical: 14, gap: 8 },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  rowName: { flex: 1, fontSize: 15, fontFamily: 'Barlow_600SemiBold' },
  rowValue: { fontSize: 24, lineHeight: 28, fontFamily: 'BarlowCondensed_700Bold', fontVariant: ['tabular-nums'] },
  rowBar: { height: 6, borderRadius: 3 },
  rowDetail: { fontSize: 14, lineHeight: 20 },
});
