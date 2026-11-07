import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { EmomPhase } from '../../domain/emom';
import { Icon, Text, tapFeedback } from '../../shared/components/ui';
import { useAppInsets } from '../../shared/layout/useAppInsets';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, radii, spacing } from '../../shared/theme/tokens';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { formatClock } from '../../shared/utils/format';

/** What the EMOM screens show: the plan, where the clock is, and what each round saved. */
export interface EmomView {
  exercise: string;
  intervalSec: number;
  rounds: number;
  phase: EmomPhase;
  /** Value saved by each round already over, in order (reps, or seconds for a hold). */
  done: number[];
  /** Value of the round in progress, and the prefill of the next ones. */
  value: number;
  field: 'reps' | 'durationSec';
  /** False once the last round has started: a round added then would never run. */
  canAddRound: boolean;
}

/** Round count and planned cells stop showing their figures past this, where a cell is too narrow for one. */
const FIGURES_UP_TO = 12;

function clockOf(view: EmomView): string {
  if (view.phase.phase === 'countdown') return String(view.phase.secondsLeft);
  if (view.phase.phase === 'done') return '0:00';
  return formatClock(view.phase.secondsLeft);
}

function currentRound(view: EmomView): number {
  if (view.phase.phase === 'running') return view.phase.round;
  return view.phase.phase === 'done' ? view.rounds : 0;
}

/**
 * The running EMOM on its own screen, read from the floor a couple of metres away: the round and the clock in
 * very large figures, one cell per round with what it saved, and the few controls in the thumb zone (this round's
 * value, one more round, hold to stop). "Workout" and the back button go back to the workout; the EMOM keeps running.
 */
export function EmomStage({ view, onChange, onAddRound, onStop, onClose }: {
  view: EmomView;
  onChange: (delta: number) => void;
  onAddRound: () => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette, largeText } = useTheme();
  const insets = useAppInsets();
  const [stopHint, setStopHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => {
      subscription.remove();
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, [onClose]);

  const round = currentRound(view);
  const countdown = view.phase.phase === 'countdown';
  const running = view.phase.phase === 'running';
  const elapsed = running && view.phase.phase === 'running' ? Math.min(1, Math.max(0, 1 - view.phase.secondsLeft / view.intervalSec)) : 0;
  const lastRound = running && round === view.rounds;
  const amount = (value: number) => (view.field === 'durationSec' ? formatClock(value) : t('emom.reps', { count: value }));
  const figures = view.rounds <= FIGURES_UP_TO;
  const savedTotal = view.done.reduce((sum, value) => sum + value, 0);
  const muted = palette.heroTextMuted;
  const showStopHint = () => {
    tapFeedback();
    setStopHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setStopHint(false), 3000);
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.stage, { backgroundColor: palette.hero }]}>
      {/* One page that fits a phone at normal sizes and scrolls at very large text, so nothing is ever pushed off screen. */}
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.page, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg }]} showsVerticalScrollIndicator={false}>
      <View style={styles.topRow}>
        <View style={styles.titles}>
          <Text style={[styles.exercise, { color: palette.heroText }]}>{view.exercise}</Text>
          <Text style={[styles.tag, { color: muted }]}>{t('emom.every', { time: formatClock(view.intervalSec) }).toUpperCase()}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('emom.showWorkout')}
          onPress={() => { tapFeedback(); onClose(); }}
          style={({ pressed }) => [styles.workoutButton, { borderColor: muted }, pressed && styles.pressed]}
        >
          <Icon name="list" size={18} color={palette.heroText} />
          <Text style={[styles.tagStrong, { color: palette.heroText }]}>{t('emom.workout').toUpperCase()}</Text>
        </Pressable>
      </View>

      <View style={styles.figures}>
        <View>
          <Text style={[styles.tagWide, { color: muted }]}>{(countdown ? t('emom.getReadyShort') : lastRound ? t('emom.lastRound') : t('emom.roundWord')).toUpperCase()}</Text>
          <View style={styles.roundRow} accessible accessibilityLabel={t('emom.round', { round: Math.max(1, round), rounds: view.rounds })}>
            <Text maxFontSizeMultiplier={1} style={[styles.round, { color: countdown ? muted : palette.heroText }]}>{Math.max(1, round)}</Text>
            <Text maxFontSizeMultiplier={1} style={[styles.rounds, { color: muted }]}>{`/ ${view.rounds}`}</Text>
          </View>
        </View>

        <View style={styles.clockBlock}>
          {/* Already huge: these figures do not grow with the system text size, so the clock never wraps. */}
          <Text maxFontSizeMultiplier={1} numberOfLines={1} accessibilityRole="timer" accessibilityLabel={`${countdown ? t('emom.startsIn') : t('emom.timeLeft')} ${clockOf(view)}`} style={[styles.clock, { color: palette.heroText }]}>{clockOf(view)}</Text>
          <View accessible={false} style={[styles.track, { backgroundColor: palette.heroOverlay }]}>
            <View style={[styles.fill, { backgroundColor: palette.heroText, width: `${Math.round(elapsed * 100)}%` }]} />
          </View>
          <View style={styles.captionRow}>
            <Text style={[styles.caption, { color: muted }]}>{(countdown ? t('emom.startsIn') : t('emom.timeLeft')).toUpperCase()}</Text>
            {running && !lastRound ? <Text style={[styles.caption, { color: muted }]}>{t('emom.next', { round: round + 1, value: amount(view.value) }).toUpperCase()}</Text> : null}
          </View>
        </View>

        <View style={styles.stripBlock}>
          <View style={styles.strip} accessible accessibilityLabel={t('emom.stripLabel', { done: view.done.length, rounds: view.rounds })}>
            {Array.from({ length: view.rounds }, (_, index) => {
              const saved = index < view.done.length;
              const current = running && index === round - 1;
              const cellValue = saved ? view.done[index] : view.value;
              return (
                <View
                  key={index}
                  style={[
                    styles.cell,
                    saved ? { backgroundColor: palette.heroText } : current ? [styles.cellCurrent, { borderColor: palette.heroText }] : { borderColor: muted, borderWidth: 1 },
                  ]}
                >
                  {current ? <View style={[styles.cellFill, { height: `${Math.round(elapsed * 100)}%`, backgroundColor: palette.heroOverlay }]} /> : null}
                  {figures && view.field === 'reps' ? (
                    <Text style={[styles.cellText, { color: saved ? palette.hero : current ? palette.heroText : muted }]}>{cellValue}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
          <Text style={[styles.caption, { color: muted }]}>{t('emom.savedSummary', { done: view.done.length, total: view.field === 'reps' ? t('emom.reps', { count: savedTotal }) : formatClock(savedTotal) }).toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <View style={styles.valueRow}>
          <Text style={[styles.tagStrong, styles.valueLabel, largeText && styles.fullRow, { color: muted }]}>{t('emom.thisRound').toUpperCase()}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`${t('emom.thisRound')} −`} onPress={() => { tapFeedback(); onChange(-1); }} style={({ pressed }) => [styles.step, { backgroundColor: palette.heroOverlay }, pressed && styles.pressed]}>
            <Icon name="remove" size={26} color={palette.heroText} />
          </Pressable>
          <Text maxFontSizeMultiplier={1.2} accessibilityLiveRegion="polite" style={[styles.value, { color: palette.heroText }]}>{amount(view.value)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`${t('emom.thisRound')} +`} onPress={() => { tapFeedback(); onChange(1); }} style={({ pressed }) => [styles.step, { backgroundColor: palette.heroOverlay }, pressed && styles.pressed]}>
            <Icon name="add" size={26} color={palette.heroText} />
          </Pressable>
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('emom.addRound')}
            accessibilityState={{ disabled: !view.canAddRound }}
            disabled={!view.canAddRound}
            onPress={() => { tapFeedback(); onAddRound(); }}
            style={({ pressed }) => [styles.action, largeText && styles.fullRow, { backgroundColor: palette.heroText }, !view.canAddRound && styles.disabled, pressed && styles.pressed]}
          >
            <Icon name="add" size={22} color={palette.hero} />
            <Text style={[styles.actionText, { color: palette.hero }]}>{t('emom.oneRound').toUpperCase()}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('emom.stop')}
            accessibilityHint={t('emom.holdHint')}
            accessibilityActions={[{ name: 'longpress', label: t('emom.stop') }]}
            onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') onStop(); }}
            onPress={showStopHint}
            onLongPress={() => { tapFeedback(); onStop(); }}
            delayLongPress={600}
            style={({ pressed }) => [styles.action, largeText && styles.fullRow, styles.actionOutline, { borderColor: muted }, pressed && styles.pressed]}
          >
            <Icon name="stop" size={16} color={palette.heroText} />
            <Text style={[styles.actionTextQuiet, { color: palette.heroText }]}>{t('emom.holdToStop')}</Text>
          </Pressable>
        </View>
        {stopHint ? <Text accessibilityLiveRegion="polite" style={[styles.caption, styles.hint, { color: palette.heroText }]}>{t('emom.holdHint')}</Text> : null}
      </View>
      </ScrollView>
    </View>
  );
}

/** The running EMOM in one line at the bottom of the workout: round and clock; a tap opens the full screen again. */
export function EmomMiniDock({ view, label, onOpen }: { view: EmomView; label: string; onOpen: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${view.exercise}, ${clockOf(view)}`}
      accessibilityHint={t('emom.openStage')}
      onPress={() => { tapFeedback(); onOpen(); }}
      style={({ pressed }) => [styles.mini, { backgroundColor: palette.hero }, pressed && styles.pressed]}
    >
      <View style={styles.miniText}>
        <Text style={[styles.miniLabel, { color: palette.heroText }]} numberOfLines={2}>{label}</Text>
        <Text style={[styles.caption, { color: palette.heroTextMuted }]} numberOfLines={1}>{view.exercise}</Text>
      </View>
      <Text maxFontSizeMultiplier={1.2} accessibilityRole="timer" style={[styles.miniClock, { color: palette.heroText }]}>{clockOf(view)}</Text>
      <Icon name="chevron-up" size={22} color={palette.heroText} />
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  stage: { zIndex: 20, elevation: 20 },
  page: { flexGrow: 1, paddingHorizontal: spacing.xl, gap: spacing.md },
  figures: { flexGrow: 1, justifyContent: 'flex-end', gap: spacing.lg, paddingBottom: spacing.xs },
  fullRow: { flexBasis: '100%' },
  topRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  titles: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0 },
  exercise: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, textTransform: 'uppercase' },
  tag: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16, letterSpacing: 1 },
  tagStrong: { fontFamily: fonts.monoSemibold, fontSize: 12, lineHeight: 16, letterSpacing: 1 },
  tagWide: { fontFamily: fonts.monoSemibold, fontSize: 13, lineHeight: 18, letterSpacing: 3 },
  workoutButton: { minHeight: MIN_TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderRadius: radii.control },
  scroll: { flex: 1 },
  roundRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: spacing.sm },
  round: { fontFamily: fonts.display, fontSize: 132, lineHeight: 128, letterSpacing: -3, fontVariant: ['tabular-nums'] },
  rounds: { fontFamily: fonts.displayMedium, fontSize: 48, lineHeight: 52 },
  clockBlock: { gap: spacing.sm },
  clock: { fontFamily: fonts.monoBold, fontSize: 96, lineHeight: 100, letterSpacing: -4, fontVariant: ['tabular-nums'] },
  track: { height: 8, overflow: 'hidden' },
  fill: { height: 8 },
  captionRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  caption: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
  stripBlock: { gap: spacing.sm },
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  cell: { flexGrow: 1, flexBasis: 18, minWidth: 18, maxWidth: 48, minHeight: 44, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cellCurrent: { borderWidth: 2 },
  cellFill: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  cellText: { fontFamily: fonts.monoBold, fontSize: 13, lineHeight: 16 },
  controls: { gap: spacing.sm },
  valueRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  valueLabel: { flexGrow: 1, flexBasis: 80 },
  step: { width: 56, height: 56, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 88, textAlign: 'center', fontFamily: fonts.display, fontSize: 32, lineHeight: 36, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: 140, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.control },
  actionOutline: { borderWidth: 1 },
  actionText: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 16, letterSpacing: 0.5, textAlign: 'center' },
  actionTextQuiet: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 15, textAlign: 'center' },
  hint: { textAlign: 'center' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  mini: { minHeight: 56, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.control },
  miniText: { flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 0 },
  miniLabel: { fontFamily: fonts.display, fontSize: 18, lineHeight: 22 },
  miniClock: { fontFamily: fonts.monoBold, fontSize: 28, lineHeight: 32, fontVariant: ['tabular-nums'] },
});
