import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Tag, Text } from '../../../shared/components/ui';
import { readBooleanPreference, writePreference } from '../../../shared/settings/preferences';
import { useInk } from '../../../shared/theme/ink';
import { useScaledStyles } from '../../../shared/theme/useScaledStyles';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, radii, spacing } from '../../../shared/theme/tokens';
import { formatNumber } from '../../../shared/utils/format';
import type { ExerciseTelemetry, MeasuredComparison, PrStatus } from './derive';
import type { TelemetryView } from './useExerciseTelemetry';

const OPEN_KEY = 'workout.telemetry.open';

export interface TelemetryTile {
  id: 'rpe' | 'form' | 'rom' | 'assistance' | 'work' | 'best';
  label: string;
  /** Main figure; "—" when nothing is rated or known (never 0). */
  value: string;
  /** Reference line: the historical figure and the signed difference. */
  reference: string;
  /** Plain-words state for screen readers and the colour-free marker. */
  state: string;
  /** Colour of the reference line: green better, orange worse; ratings never claim a change they cannot know. */
  tone: 'good' | 'bad' | 'neutral';
}

type T = (key: string, options?: Record<string, unknown>) => string;
const signed = (delta: number) => `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${formatNumber(Math.abs(delta))}`;

function ratingTile(id: 'rpe' | 'form' | 'rom', label: string, comparison: MeasuredComparison, t: T): TelemetryTile {
  const tone = id === 'rpe' || comparison.delta === null || comparison.delta === 0 ? 'neutral' : comparison.delta > 0 ? 'good' : 'bad';
  const { live, historical, delta } = comparison;
  return {
    id, label,
    value: live.mean === null ? '—' : formatNumber(live.mean),
    reference: historical.mean === null ? `${t('telemetry.hist')} —` : `${t('telemetry.hist')} ${formatNumber(historical.mean)}${delta === null ? '' : ` / ${signed(delta)}`}`,
    tone,
    state: live.count === 0 ? t('telemetry.notRated') : t('telemetry.ratedSets', { count: live.count }),
  };
}

const prLabel = (status: PrStatus, t: T): string | null => status === 'candidate' ? t('telemetry.candidate') : status === 'confirmed' ? t('telemetry.confirmed')
  : status === 'first-at-load' ? t('telemetry.firstAtLoad') : status === 'uncomparable' ? t('telemetry.uncomparable') : null;

/** The tiles shown in the dock, with honest figures: unit-safe work, unknown assistance kept unknown. */
export function telemetryTiles(view: TelemetryView, t: T): TelemetryTile[] {
  const { telemetry, usesBands } = view;
  const tiles = [
    ratingTile('rpe', t('telemetry.rpe'), telemetry.rpe, t),
    ratingTile('form', t('telemetry.form'), telemetry.form, t),
    ratingTile('rom', t('telemetry.rom'), telemetry.rom, t),
  ];
  if (usesBands && telemetry.assistance.visible) {
    const { live, historical, unknown, delta } = telemetry.assistance;
    tiles.push({
      id: 'assistance', label: t('telemetry.assistance'),
      value: unknown ? '?' : live.mean === null ? '—' : `${formatNumber(live.mean)} kg`,
      reference: historical.mean === null ? `${t('telemetry.hist')} —` : `${t('telemetry.hist')} ${formatNumber(historical.mean)} kg${delta === null ? '' : ` / ${signed(delta)}`}`,
      state: unknown ? t('telemetry.unknownAssistance') : delta === null ? '' : delta < 0 ? t('telemetry.lessHelp') : delta > 0 ? t('telemetry.moreHelp') : '',
      tone: unknown || delta === null || delta === 0 ? 'neutral' : delta < 0 ? 'good' : 'bad',
    });
  }
  const { volume, bestComparable } = telemetry;
  tiles.push({
    id: 'work', label: t('telemetry.work'),
    value: `${formatNumber(volume.liveWork)} ${volume.workUnit}`,
    reference: volume.historicalPreviousWork === null ? t('telemetry.firstSession') : `${t('telemetry.hist')} ${formatNumber(volume.historicalPreviousWork)} ${volume.workUnit}`,
    state: volume.loadedUnit && volume.liveLoaded !== null ? `${formatNumber(volume.liveLoaded)} ${volume.loadedUnit}` : '',
    tone: 'neutral',
  });
  const timed = volume.workUnit === 's';
  tiles.push({
    id: 'best', label: t(timed ? 'telemetry.bestHold' : 'telemetry.bestReps'),
    value: bestComparable.current === null ? '—' : `${formatNumber(bestComparable.current)}${timed ? ' s' : ''}`,
    reference: bestComparable.historical === null ? t('telemetry.noBaseline') : `${t('telemetry.hist')} ${formatNumber(bestComparable.historical)}${timed ? ' s' : ''}`,
    state: prLabel(bestComparable.status, t) ?? '',
    tone: 'neutral',
  });
  return tiles;
}

/** One line for the compact dock: the state, the record status and the number of sessions behind the baseline. */
export function telemetrySummary(view: TelemetryView, t: T, short = false): string {
  const { telemetry, sessions } = view;
  const parts = [telemetry.mode === 'preview' ? t('telemetry.preview') : telemetry.loggedWorkingSets === 0 ? t('telemetry.noSet') : t('telemetry.logged')];
  const record = prLabel(telemetry.bestComparable.status, t);
  if (record) parts.push(record);
  if (!short) parts.push(sessions === 0 ? t('telemetry.firstSession') : t('telemetry.historyMean', { count: sessions }));
  return parts.join(' · ');
}

/**
 * Live feedback of the exercise in hand against its comparable history, above the timer and the footer
 * actions. Compact (one line) at large text sizes and on short screens; the figures never cover the set editor.
 */
export function ExerciseTelemetryDock({ view, compact }: { view: TelemetryView | null; compact: boolean }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette, largeText } = useTheme();
  const ink = useInk();
  const [open, setOpen] = useState(() => readBooleanPreference(OPEN_KEY, false));
  const expanded = open && !compact;
  const toggle = () => { setOpen(!open); writePreference(OPEN_KEY, String(!open)); };
  if (!view) {
    return (
      <View style={[styles.dock, { borderColor: ink, backgroundColor: palette.surface }]}>
        <Tag>{t('telemetry.loading')}</Tag>
      </View>
    );
  }
  const tiles = expanded ? telemetryTiles(view, t) : [];
  const record = view.telemetry.bestComparable.status;
  const summary = telemetrySummary(view, t, compact);
  const scope = view.sessions === 0 ? t('telemetry.firstSession') : t('telemetry.sessions', { count: view.sessions });
  const baseline = prLabel(record, t) ?? (view.telemetry.bestComparable.hasPreviousAtLoad ? t('telemetry.baselineOk') : t('telemetry.noBaseline'));
  const toneColor = (tone: TelemetryTile['tone']) => tone === 'good' ? palette.success : tone === 'bad' ? palette.warning : palette.textMuted;
  return (
    <View style={[styles.dock, { borderColor: ink, backgroundColor: palette.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('telemetry.title')}. ${summary}. ${t(expanded ? 'telemetry.collapse' : 'telemetry.expand')}`}
        accessibilityState={{ expanded }}
        disabled={compact}
        onPress={toggle}
        style={styles.header}
      >
        <Text style={[styles.headText, styles.flex, { color: palette.text }]}>
          {`${t('telemetry.title').toUpperCase()} `}
          <Text style={{ color: palette.success }}>{`● ${t('telemetry.live').toUpperCase()}`}</Text>
          {` · ${scope.toUpperCase()}`}
        </Text>
        {compact ? null : <Text style={[styles.headText, { color: palette.accentStrong }]}>{t(expanded ? 'telemetry.collapseWord' : 'telemetry.expandWord').toUpperCase()}</Text>}
      </Pressable>
      {expanded ? (
        <>
          <View style={[styles.grid, { borderTopColor: palette.border }]}>
            {tiles.map((tile) => (
              <View
                key={tile.id}
                accessible
                accessibilityLabel={t('telemetry.tile', { label: tile.label, value: tile.value, reference: tile.reference, state: tile.state })}
                style={[styles.tile, largeText && styles.tileLarge, { borderColor: palette.border }]}
              >
                <Text style={[styles.tileLabel, { color: palette.textMuted }]}>{tile.label.toUpperCase()}</Text>
                <Text style={[styles.tileValue, { color: palette.text }]}>{tile.value}</Text>
                <Text style={[styles.tileReference, { color: toneColor(tile.tone) }]}>{tile.reference.toUpperCase()}</Text>
                {tile.state ? <Text style={[styles.tileState, { color: tile.id === 'best' && (record === 'confirmed' || record === 'candidate') ? palette.record : palette.textMuted }]}>{tile.state.toUpperCase()}</Text> : null}
              </View>
            ))}
          </View>
          <View style={[styles.status, { backgroundColor: palette.accentSoft, borderTopColor: palette.border }]}>
            <Text style={[styles.tileLabel, styles.flex, { color: palette.text }]}>{t('telemetry.prCheck').toUpperCase()}</Text>
            <Text style={[styles.tileLabel, { color: record === 'confirmed' || record === 'candidate' ? palette.record : palette.textMuted }]}>{baseline.toUpperCase()}</Text>
          </View>
        </>
      ) : (
        <Text style={[styles.summary, { color: record === 'confirmed' || record === 'candidate' ? palette.record : palette.textMuted }]}>{summary}</Text>
      )}
    </View>
  );
}

export type { ExerciseTelemetry };

const baseStyles = StyleSheet.create({
  dock: { borderWidth: 1, borderRadius: radii.surface, overflow: 'hidden' },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headText: { fontSize: 12, letterSpacing: 0.5 },
  flex: { flex: 1, minWidth: 0 },
  summary: { fontSize: 12, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1 },
  tile: { flexGrow: 1, flexBasis: '33%', minWidth: 96, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, padding: spacing.sm, gap: spacing.xs },
  tileLarge: { flexBasis: '50%' },
  tileLabel: { fontSize: 12, letterSpacing: 0.5 },
  tileValue: { fontSize: 24, fontWeight: '700' },
  tileReference: { fontSize: 12, letterSpacing: 0.5 },
  tileState: { fontSize: 12, letterSpacing: 0.5 },
  status: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, padding: spacing.sm, borderTopWidth: 1 },
});
