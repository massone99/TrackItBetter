import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Body, Card, Icon, IconButton, Label, ListGroup, ListRow, Metric, SectionTitle, Text } from '../../../shared/components/ui';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useScaledStyles } from '../../../shared/theme/useScaledStyles';
import { formatNumber } from '../../../shared/utils/format';
import type { FormSession } from '../formTrend';
import { StatsChart } from './StatsChart';

const SESSIONS_PER_PAGE = 8;

/**
 * Average form of the exercise session by session (1–5): one bar per session, the latest selected.
 * The selected session shows its sets' ratings and the change from the session before, green when
 * better and red when worse, like the workout's comparison.
 */
export function FormTrendCard({ sessions }: { sessions: readonly FormSession[] }) {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lastPage = Math.max(0, Math.ceil(sessions.length / SESSIONS_PER_PAGE) - 1);
  const currentPage = Math.min(page, lastPage);
  const end = sessions.length - currentPage * SESSIONS_PER_PAGE;
  const shown = sessions.slice(Math.max(0, end - SESSIONS_PER_PAGE), end);
  const selected = shown.find((session) => session.workoutId === selectedId) ?? shown[shown.length - 1];
  const chartIndex = selected ? shown.indexOf(selected) : null;
  const fullIndex = selected ? sessions.indexOf(selected) : -1;
  const previous = fullIndex > 0 ? sessions[fullIndex - 1] : null;
  const change = selected && previous ? Math.round((selected.average - previous.average) * 10) / 10 : null;
  const dateLabel = (date: Date) => date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
  const changePage = (next: number) => { setPage(next); setSelectedId(null); };
  const tone = change == null || change === 0 ? palette.textMuted : change > 0 ? palette.success : palette.warning;

  return (
    <Card>
      <SectionTitle title={t('formTrend.title')} />
      {sessions.length === 0 ? <Body>{t('formTrend.empty')}</Body> : <>
        <Body>{t('formTrend.body')}</Body>
        <View style={styles.pager}>
          <IconButton icon="chevron-back" label={t('repsAtLoad.older')} disabled={currentPage >= lastPage} onPress={() => changePage(currentPage + 1)} />
          <Label style={styles.range}>{`${dateLabel(shown[0].startedAt)} – ${dateLabel(shown[shown.length - 1].startedAt)}`}</Label>
          <IconButton icon="chevron-forward" label={t('repsAtLoad.newer')} disabled={currentPage === 0} onPress={() => changePage(currentPage - 1)} />
        </View>
        <StatsChart
          values={shown.map((session) => session.average)}
          labels={shown.map((session) => dateLabel(session.startedAt))}
          selected={chartIndex}
          onSelect={(index) => setSelectedId(shown[index].workoutId)}
          formatPrimary={(value) => formatNumber(value)}
          zeroBased
          accessibilityLabel={(index) => `${shown[index].startedAt.toLocaleDateString(i18n.language)}, ${shown[index].workoutName}: ${t('formTrend.average', { value: formatNumber(shown[index].average) })}`}
        />
        {selected ? <View style={styles.detail}>
          <Label>{selected.startedAt.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })}</Label>
          <View style={styles.metrics}>
            <Metric value={formatNumber(selected.average)} label={t('formTrend.averageLabel')} />
            <Metric value={selected.ratedSets} label={t('formTrend.ratedSets')} />
          </View>
          <View style={styles.changeRow}>
            {change != null && change !== 0 ? <Icon name={change > 0 ? 'arrow-up' : 'arrow-down'} size={16} color={tone} /> : null}
            <Text style={[styles.change, { color: tone }]}>
              {change == null ? t('formTrend.first') : change === 0 ? t('formTrend.same') : t('formTrend.change', { change: `${change > 0 ? '+' : '−'}${formatNumber(Math.abs(change))}` })}
            </Text>
          </View>
          <Body>{t('formTrend.sets', { values: selected.ratings.join(' · ') })}</Body>
          <ListGroup><ListRow icon="calendar-outline" title={selected.workoutName} subtitle={t('repsAtLoad.openWorkout')} onPress={() => router.push({ pathname: '/workout/history/[id]', params: { id: selected.workoutId } })} /></ListGroup>
        </View> : null}
      </>}
    </Card>
  );
}

const baseStyles = StyleSheet.create({
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  range: { flex: 1, textAlign: 'center' },
  detail: { gap: 12, paddingTop: 8 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  change: { fontSize: 14, lineHeight: 20 },
});
