import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Body, Card, Icon, IconButton, Label, ListGroup, ListRow, Metric, SectionTitle, SegmentedControl, tapFeedback, Text } from '../../../shared/components/ui';
import { fonts } from '../../../shared/theme/typography';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../../shared/theme/useScaledStyles';
import { formatNumber } from '../../../shared/utils/format';
import type { RepsAtLoadGroup } from '../repsAtLoad';
import { StatsChart } from './StatsChart';

const SESSIONS_PER_PAGE = 6;
type ViewMetric = 'best' | 'total';

const OVERVIEW_ROWS = 5;

/**
 * Reps compared by net load: added weight or help from bands. A ladder of every load at a glance
 * (last session, best, change since the session before), each row selecting the load whose
 * sessions are charted below.
 */
export function RepsAtLoadCard({ groups }: { groups: readonly RepsAtLoadGroup[] }) {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const [load, setLoad] = useState<number | null>(null);
  const [metric, setMetric] = useState<ViewMetric>('best');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
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
  const select = (kg: number) => { setLoad(kg); setPage(0); setSelectedId(null); };
  // The ladder runs from the most load (least help) down; the selected load always stays in view.
  const ladder = [...groups].sort((a, b) => b.loadKg - a.loadKg);
  const visible = showAll ? ladder : ladder.filter((item, index) => index < OVERVIEW_ROWS || item.loadKg === group?.loadKg);
  const signed = (amount: number) => `${amount > 0 ? '+' : '−'}${formatNumber(Math.abs(amount))}`;

  return (
    <Card>
      <SectionTitle title={t('repsAtLoad.title')} />
      <Body>{t('repsAtLoad.body')}</Body>
      {!group ? <Body>{t('repsAtLoad.empty')}</Body> : <>
        {ladder.length > 1 ? (
          <View accessibilityRole="radiogroup" style={styles.ladder}>
            {visible.map((item) => {
              const last = item.sessions[item.sessions.length - 1];
              const before = item.sessions.length > 1 ? item.sessions[item.sessions.length - 2] : null;
              const delta = before ? last.bestReps - before.bestReps : null;
              const best = Math.max(...item.sessions.map((session) => session.bestReps));
              const on = item.loadKg === group.loadKg;
              return (
                <Pressable
                  key={item.loadKg}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${weightLabel(item.loadKg)}: ${t('repsAtLoad.rowSummary', { last: last.bestReps, best, sessions: item.sessions.length })}`}
                  onPress={() => { tapFeedback(); select(item.loadKg); }}
                  style={({ pressed }) => [styles.rung, { borderColor: on ? palette.accentStrong : palette.border, backgroundColor: on ? palette.accentSoft : 'transparent', opacity: pressed ? 0.75 : 1 }]}
                >
                  <View style={styles.rungMain}>
                    <Text style={[styles.rungLoad, { color: on ? palette.accentStrong : palette.text }]}>{weightLabel(item.loadKg)}</Text>
                    <Text style={[styles.rungMeta, { color: palette.textMuted }]}>{t('repsAtLoad.rowSummary', { last: last.bestReps, best, sessions: item.sessions.length })}</Text>
                  </View>
                  {delta !== null && delta !== 0 ? (
                    <View style={styles.rungDelta}>
                      <Icon name={delta > 0 ? 'arrow-up' : 'arrow-down'} size={14} color={delta > 0 ? palette.success : palette.warning} />
                      <Text style={[styles.rungDeltaText, { color: delta > 0 ? palette.success : palette.warning }]}>{signed(delta)}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
            {ladder.length > visible.length || showAll ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setShowAll((current) => !current)} style={styles.more}>
                <Text style={[styles.moreText, { color: palette.accentStrong }]}>{showAll ? t('repsAtLoad.showFewerLoads') : t('repsAtLoad.showAllLoads', { total: ladder.length })}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.loadRow}>
            <Label>{t('repsAtLoad.weight')}</Label>
            <Text style={[styles.rungLoad, { color: palette.text }]}>{weightLabel(group.loadKg)}</Text>
          </View>
        )}
        <SegmentedControl value={metric} options={[
          { value: 'best', label: t('repsAtLoad.best') },
          { value: 'total', label: t('repsAtLoad.total') },
        ]} onChange={setMetric} />
        <View style={styles.pager}>
          <IconButton icon="chevron-back" label={t('repsAtLoad.older')} disabled={currentPage >= lastPage} onPress={() => changePage(currentPage + 1)} />
          <Label style={styles.range}>{shown.length ? `${weightLabel(group.loadKg)} · ${dateLabel(shown[0].startedAt)} – ${dateLabel(shown[shown.length - 1].startedAt)}` : ''}</Label>
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
            {change == null ? t('repsAtLoad.first') : change === 0 ? t('repsAtLoad.same') : t('repsAtLoad.change', { change: signed(change), metric: t(metric === 'best' ? 'repsAtLoad.best' : 'repsAtLoad.total').toLowerCase() })}
          </Text>
          <Body>{t('repsAtLoad.sets', { values: selected.reps.map((reps) => formatNumber(reps)).join(' + ') })}</Body>
          <ListGroup><ListRow icon="calendar-outline" title={selected.workoutName} subtitle={t('repsAtLoad.openWorkout')} onPress={() => router.push({ pathname: '/workout/history/[id]', params: { id: selected.workoutId } })} /></ListGroup>
        </View> : null}
        <Body>{t('repsAtLoad.hint')}</Body>
      </>}
    </Card>
  );
}

const baseStyles = StyleSheet.create({
  loadRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  ladder: { gap: 8 },
  rung: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  rungMain: { flex: 1, gap: 2 },
  rungLoad: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  rungMeta: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  rungDelta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rungDeltaText: { fontFamily: fonts.semibold, fontSize: 14, fontVariant: ['tabular-nums'] },
  more: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontFamily: fonts.semibold, fontSize: 14 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  range: { flex: 1, textAlign: 'center' },
  detail: { gap: 12, paddingTop: 8 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  change: { fontSize: 14, lineHeight: 20 },
});
