import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Tag, Text } from '../../../shared/components/ui';
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
}

type T = (key: string, options?: Record<string, unknown>) => string;
const signed = (delta: number) => `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${formatNumber(Math.abs(delta))}`;

function ratingTile(id: 'rpe' | 'form' | 'rom', label: string, comparison: MeasuredComparison, t: T): TelemetryTile {
  const { live, historical, delta } = comparison;
  return {
    id, label,
    value: live.mean === null ? '—' : formatNumber(live.mean),
    reference: historical.mean === null ? `${t('telemetry.hist')} —` : `${t('telemetry.hist')} ${formatNumber(historical.mean)}${delta === null ? '' : ` · ${signed(delta)}`}`,
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
      reference: historical.mean === null ? `${t('telemetry.hist')} —` : `${t('telemetry.hist')} ${formatNumber(historical.mean)} kg${delta === null ? '' : ` · ${signed(delta)}`}`,
      state: unknown ? t('telemetry.unknownAssistance') : delta === null ? '' : delta < 0 ? t('telemetry.lessHelp') : delta > 0 ? t('telemetry.moreHelp') : '',
    });
  }
  const { volume, bestComparable } = telemetry;
  tiles.push({
    id: 'work', label: t('telemetry.work'),
    value: `${formatNumber(volume.liveWork)} ${volume.workUnit}`,
    reference: volume.historicalPreviousWork === null ? t('telemetry.firstSession') : `${t('telemetry.hist')} ${formatNumber(volume.historicalPreviousWork)} ${volume.workUnit}`,
    state: volume.loadedUnit && volume.liveLoaded !== null ? `${formatNumber(volume.liveLoaded)} ${volume.loadedUnit}` : '',
  });
  const timed = volume.workUnit === 's';
  tiles.push({
    id: 'best', label: t(timed ? 'telemetry.bestHold' : 'telemetry.bestReps'),
    value: bestComparable.current === null ? '—' : `${formatNumber(bestComparable.current)}${timed ? ' s' : ''}`,
    reference: bestComparable.historical === null ? t('telemetry.noBaseline') : `${t('telemetry.hist')} ${formatNumber(bestComparable.historical)}${timed ? ' s' : ''}`,
    state: prLabel(bestComparable.status, t) ?? '',
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
  const { palette } = useTheme();
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
        <View style={styles.flex}>
          <Tag>{t('telemetry.title')}</Tag>
          <Text style={[styles.summary, { color: record === 'confirmed' || record === 'candidate' ? palette.record : palette.textMuted }]}>{summary}</Text>
        </View>
        {compact ? null : <Icon name={expanded ? 'chevron-down' : 'chevron-up'} size={20} color={palette.textMuted} />}
      </Pressable>
      {expanded ? (
        <View style={styles.grid}>
          {tiles.map((tile) => (
            <View
              key={tile.id}
              accessible
              accessibilityLabel={t('telemetry.tile', { label: tile.label, value: tile.value, reference: tile.reference, state: tile.state })}
              style={[styles.tile, { borderColor: palette.border, backgroundColor: palette.surfaceMuted }]}
            >
              <Text style={[styles.tileLabel, { color: palette.textMuted }]}>{tile.label}</Text>
              <Text style={[styles.tileValue, { color: palette.text }]}>{tile.value}</Text>
              <Text style={[styles.tileReference, { color: palette.textMuted }]}>{tile.reference}</Text>
              {tile.state ? <Text style={[styles.tileState, { color: tile.id === 'best' && (record === 'confirmed' || record === 'candidate') ? palette.record : palette.textMuted }]}>{tile.state}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export type { ExerciseTelemetry };

const baseStyles = StyleSheet.create({
  dock: { borderWidth: 1, borderRadius: radii.surface, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  flex: { flex: 1, minWidth: 0 },
  summary: { fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, padding: spacing.xs },
  tile: { flexGrow: 1, flexBasis: 96, minWidth: 96, borderWidth: 1, borderRadius: radii.control, padding: spacing.sm, gap: 2 },
  tileLabel: { fontSize: 12 },
  tileValue: { fontSize: 20, fontWeight: '700' },
  tileReference: { fontSize: 12 },
  tileState: { fontSize: 12 },
});
