import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Body, Card, Chip, IconButton, Label, ListGroup, ListRow, Metric, SectionTitle, SegmentedControl, Sheet, Text } from '../../../shared/components/ui';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../../shared/theme/useScaledStyles';
import { formatNumber } from '../../../shared/utils/format';
import type { RepsAtLoadGroup } from '../repsAtLoad';
import { StatsChart } from './StatsChart';

const SESSIONS_PER_PAGE = 6;
type ViewMetric = 'best' | 'total';

/** An additional exercise analysis; the existing metric explorer keeps its own controls. */
export function RepsAtLoadCard({ groups }: { groups: readonly RepsAtLoadGroup[] }) {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const [load, setLoad] = useState<number | null>(null);
  const [metric, setMetric] = useState<ViewMetric>('best');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [choosingLoad, setChoosingLoad] = useState(false);
  const group = groups.find((item) => item.loadKg === load) ?? groups[0];
  const sessions = group?.sessions ?? [];
  const lastPage = Math.max(0, Math.ceil(sessions.length / SESSIONS_PER_PAGE) - 1);
  const currentPage = Math.min(page, lastPage);
  const end = sessions.length - currentPage * SESSIONS_PER_PAGE;
  const shown = sessions.slice(Math.max(0, end - SESSIONS_PER_PAGE), end);
  const selected = shown.find((session) => session.workoutId === selectedId) ?? shown[shown.length - 1];
  const chartIndex = selected ? shown.indexOf(selected) : null;
  const fullIndex = selected ? sessions.indexOf(selected) : -1;
  const previous = fullIndex > 0 ? sessions[fullIndex - 1] : null;
  const value = (session: typeof sessions[number]) => metric === 'best' ? session.bestReps : session.totalReps;
  const change = selected && previous ? value(selected) - value(previous) : null;
  const repsLabel = (count: number) => t('records.reps', { count });
  const formatWeight = (kg: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 6 }).format(kg);
  const weightLabel = (kg: number) => kg === 0 ? t('repsAtLoad.zero') : kg < 0
    ? t('repsAtLoad.assisted', { weight: formatWeight(Math.abs(kg)) })
    : `${formatWeight(kg)} kg`;
  const dateLabel = (date: Date) => date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
  const changePage = (next: number) => { setPage(next); setSelectedId(null); };

  return (
    <Card>
      <SectionTitle title={t('repsAtLoad.title')} />
      <Body>{t('repsAtLoad.body')}</Body>
      {!group ? <Body>{t('repsAtLoad.empty')}</Body> : <>
        <View style={styles.loadRow}>
          <Label>{t('repsAtLoad.weight')}</Label>
          <Chip icon="barbell-outline" label={weightLabel(group.loadKg)} selected onPress={() => setChoosingLoad(true)} />
        </View>
        <SegmentedControl value={metric} options={[
          { value: 'best', label: t('repsAtLoad.best') },
          { value: 'total', label: t('repsAtLoad.total') },
        ]} onChange={setMetric} />
        <View style={styles.pager}>
          <IconButton icon="chevron-back" label={t('repsAtLoad.older')} disabled={currentPage >= lastPage} onPress={() => changePage(currentPage + 1)} />
          <Label style={styles.range}>{shown.length ? `${dateLabel(shown[0].startedAt)} – ${dateLabel(shown[shown.length - 1].startedAt)}` : ''}</Label>
          <IconButton icon="chevron-forward" label={t('repsAtLoad.newer')} disabled={currentPage === 0} onPress={() => changePage(currentPage - 1)} />
        </View>
        <StatsChart
          values={shown.map(value)} labels={shown.map((session) => dateLabel(session.startedAt))}
          selected={chartIndex} onSelect={(index) => setSelectedId(shown[index].workoutId)}
          formatPrimary={repsLabel} zeroBased
          accessibilityLabel={(index) => `${shown[index].startedAt.toLocaleDateString(i18n.language)}, ${shown[index].workoutName}, ${weightLabel(group.loadKg)}: ${repsLabel(value(shown[index]))}`}
        />
        {selected ? <View style={styles.detail}>
          <Label>{selected.startedAt.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })}</Label>
          <View style={styles.metrics}>
            <Metric value={selected.bestReps} label={t('repsAtLoad.best')} />
            <Metric value={selected.totalReps} label={t('repsAtLoad.total')} />
            <Metric value={selected.reps.length} label={t('stats.metrics.sets')} />
          </View>
          <Text style={[styles.change, { color: change != null && change > 0 ? palette.success : palette.textMuted }]}>
            {change == null ? t('repsAtLoad.first') : change === 0 ? t('repsAtLoad.same') : t('repsAtLoad.change', { change: `${change > 0 ? '+' : '−'}${formatNumber(Math.abs(change))}`, metric: t(metric === 'best' ? 'repsAtLoad.best' : 'repsAtLoad.total').toLowerCase() })}
          </Text>
          <Body>{t('repsAtLoad.sets', { values: selected.reps.map((reps) => formatNumber(reps)).join(' + ') })}</Body>
          <ListGroup><ListRow icon="calendar-outline" title={selected.workoutName} subtitle={t('repsAtLoad.openWorkout')} onPress={() => router.push({ pathname: '/workout/history/[id]', params: { id: selected.workoutId } })} /></ListGroup>
        </View> : null}
        <Body>{t('repsAtLoad.hint')}</Body>
      </>}
      <Sheet visible={choosingLoad} onClose={() => setChoosingLoad(false)} title={t('repsAtLoad.weight')} body={t('repsAtLoad.weightHint')}>
        <ListGroup>{groups.map((item) => <ListRow
          key={item.loadKg} title={weightLabel(item.loadKg)} subtitle={t('exerciseManage.allHistory', { count: item.sessions.length })}
          selected={item.loadKg === group?.loadKg}
          onPress={() => { setLoad(item.loadKg); setPage(0); setSelectedId(null); setChoosingLoad(false); }}
        />)}</ListGroup>
      </Sheet>
    </Card>
  );
}

const baseStyles = StyleSheet.create({
  loadRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  range: { flex: 1, textAlign: 'center' },
  detail: { gap: 12, paddingTop: 8 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  change: { fontSize: 14, lineHeight: 20 },
});
