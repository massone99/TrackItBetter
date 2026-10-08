import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Body, Card, Chip, Icon, IconButton, Label, ListGroup, ListRow, Metric, SectionTitle, SegmentedControl, Sheet, Text } from '../../../shared/components/ui';
import { fonts } from '../../../shared/theme/typography';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../../shared/theme/useScaledStyles';
import { formatNumber } from '../../../shared/utils/format';
import type { RepsAtLoadGroup } from '../repsAtLoad';
import { StatsChart } from './StatsChart';

const SESSIONS_PER_PAGE = 6;
type ViewMetric = 'best' | 'total';

const RECENT_LOADS = 5;

/**
 * Reps compared by net load: added weight or help from bands. The selector keeps one height however
 * many loads were trained: a step to the next lower or higher load (to compare close loads), the
 * most recently trained loads as chips, and the full ladder in a sheet.
 */
export function RepsAtLoadCard({ groups }: { groups: readonly RepsAtLoadGroup[] }) {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const [load, setLoad] = useState<number | null>(null);
  const [metric, setMetric] = useState<ViewMetric>('best');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
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
  const shortLabel = (kg: number) => kg === 0 ? t('repsAtLoad.zeroShort') : kg < 0 ? t('repsAtLoad.assistedShort', { weight: formatWeight(Math.abs(kg)) }) : `+${formatWeight(kg)}`;
  const dateLabel = (date: Date) => date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
  const changePage = (next: number) => { setPage(next); setSelectedId(null); };
  const select = (kg: number) => { setLoad(kg); setPage(0); setSelectedId(null); };
  const signed = (amount: number) => `${amount > 0 ? '+' : '−'}${formatNumber(Math.abs(amount))}`;
  const lastOf = (item: RepsAtLoadGroup) => item.sessions[item.sessions.length - 1];
  const summary = (item: RepsAtLoadGroup) => t('repsAtLoad.rowSummary', { last: lastOf(item).bestReps, best: Math.max(...item.sessions.map((entry) => entry.bestReps)), sessions: item.sessions.length });
  const deltaOf = (item: RepsAtLoadGroup) => (item.sessions.length > 1 ? lastOf(item).bestReps - item.sessions[item.sessions.length - 2].bestReps : null);

  // The ladder, from the least load (most help) to the most; the step moves along it.
  const ladder = [...groups].sort((a, b) => a.loadKg - b.loadKg);
  const position = group ? ladder.findIndex((item) => item.loadKg === group.loadKg) : -1;
  const lower = position > 0 ? ladder[position - 1] : null;
  const higher = position >= 0 && position < ladder.length - 1 ? ladder[position + 1] : null;
  // The 5 loads trained most recently, shown in ladder order (lowest to highest, like the step) so the row reads as a scale.
  const recent = [...groups].sort((a, b) => lastOf(b).startedAt.getTime() - lastOf(a).startedAt.getTime()).slice(0, RECENT_LOADS).sort((a, b) => a.loadKg - b.loadKg);
  const groupDelta = group ? deltaOf(group) : null;

  return (
    <Card>
      <SectionTitle title={t('repsAtLoad.title')} />
      <Body>{t('repsAtLoad.body')}</Body>
      {!group ? <Body>{t('repsAtLoad.empty')}</Body> : <>
        <View style={styles.stepper}>
          <IconButton icon="chevron-back" label={lower ? t('repsAtLoad.lowerTo', { weight: weightLabel(lower.loadKg) }) : t('repsAtLoad.noLower')} disabled={!lower} onPress={() => lower && select(lower.loadKg)} />
          <View style={styles.stepperMain} accessibilityLiveRegion="polite">
            <Text style={[styles.stepperLoad, { color: palette.text }]}>{weightLabel(group.loadKg)}</Text>
            <View style={styles.stepperMeta}>
              <Text style={[styles.rungMeta, { color: palette.textMuted }]}>{summary(group)}</Text>
              {groupDelta !== null && groupDelta !== 0 ? (
                <View style={styles.rungDelta}>
                  <Icon name={groupDelta > 0 ? 'arrow-up' : 'arrow-down'} size={14} color={groupDelta > 0 ? palette.success : palette.warning} />
                  <Text style={[styles.rungDeltaText, { color: groupDelta > 0 ? palette.success : palette.warning }]}>{signed(groupDelta)}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <IconButton icon="chevron-forward" label={higher ? t('repsAtLoad.higherTo', { weight: weightLabel(higher.loadKg) }) : t('repsAtLoad.noHigher')} disabled={!higher} onPress={() => higher && select(higher.loadKg)} />
        </View>
        {ladder.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
            {recent.map((item) => <Chip key={item.loadKg} label={shortLabel(item.loadKg)} accessibilityLabel={weightLabel(item.loadKg)} selected={item.loadKg === group.loadKg} onPress={() => select(item.loadKg)} />)}
            {ladder.length > recent.length ? <Chip icon="list" label={t('repsAtLoad.allLoads', { total: ladder.length })} onPress={() => setChoosing(true)} /> : null}
          </ScrollView>
        ) : null}
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
      <Sheet visible={choosing} onClose={() => setChoosing(false)} title={t('repsAtLoad.allLoadsTitle')} body={t('repsAtLoad.allLoadsHint')}>
        <ListGroup>{ladder.map((item) => {
          const delta = deltaOf(item);
          return <ListRow
            key={item.loadKg} title={weightLabel(item.loadKg)}
            subtitle={`${summary(item)}${delta ? ` · ${signed(delta)}` : ''}`}
            selected={item.loadKg === group?.loadKg}
            onPress={() => { select(item.loadKg); setChoosing(false); }}
          />;
        })}</ListGroup>
      </Sheet>
    </Card>
  );
}

const baseStyles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperMain: { flex: 1, alignItems: 'center', gap: 2 },
  stepperLoad: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, textAlign: 'center' },
  stepperMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8 },
  chips: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  rungMeta: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  rungDelta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rungDeltaText: { fontFamily: fonts.semibold, fontSize: 14, fontVariant: ['tabular-nums'] },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  range: { flex: 1, textAlign: 'center' },
  detail: { gap: 12, paddingTop: 8 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  change: { fontSize: 14, lineHeight: 20 },
});
