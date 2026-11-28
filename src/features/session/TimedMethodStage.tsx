import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { isRepsPlan, parseTimedCues, repsOfRound, timedRounds, type TimedMethodCues, type TimedMethodPhase, type TimedMethodPlan } from '../../domain/timedMethod';
import { Icon, Sheet, Text, tapFeedback } from '../../shared/components/ui';
import { useAppInsets } from '../../shared/layout/useAppInsets';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, radii, spacing } from '../../shared/theme/tokens';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { formatClock } from '../../shared/utils/format';
import { TimedCuesEditor } from './TimedCuesEditor';

/** The clock the stage and the dock show for a phase. */
export function timedClock(phase: TimedMethodPhase): string {
  switch (phase.phase) {
    case 'countdown': case 'testCountdown': return String(phase.secondsLeft);
    case 'hold': case 'rest': case 'recovery': return formatClock(phase.secondsLeft);
    case 'test': case 'done': return formatClock(phase.seconds);
    default: return '0:00';
  }
}

/** One of the three steps (block, recovery, final hold) a phase belongs to, 1-based. */
function stepOf(phase: TimedMethodPhase): number {
  if (phase.phase === 'countdown' || phase.phase === 'hold' || phase.phase === 'rest') return 1;
  if (phase.phase === 'recovery' || phase.phase === 'ready') return 2;
  return 3;
}

export function TimedMethodStage({ exercise, plan, phase, onSkipRecovery, onStartTest, onFinishTest, onStop, onClose, onRoundReps, onMaxReps, onUpdateCues }: {
  exercise: string;
  plan: TimedMethodPlan;
  phase: TimedMethodPhase;
  /** Reps plans: corrects the reps of the current round. */
  onRoundReps?: (round: number, reps: number) => void;
  /** Reps plans: the reps counted in the max set. */
  onMaxReps?: (reps: number) => void;
  /** Updates custom audio cues live without stopping the running timer. */
  onUpdateCues?: (cues: TimedMethodCues) => void;
  onSkipRecovery: () => void;
  onStartTest: () => void;
  onFinishTest: () => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette, largeText } = useTheme();
  const insets = useAppInsets();
  const [stopHint, setStopHint] = useState(false);
  const [soundSheetOpen, setSoundSheetOpen] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedCues = parseTimedCues(plan.cues);
  const mutedAudio = (resolvedCues.volume ?? 1) <= 0;
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => { subscription.remove(); if (hintTimer.current) clearTimeout(hintTimer.current); };
  }, [onClose]);

  const muted = palette.heroTextMuted;
  const rounds = timedRounds(plan);
  const step = stepOf(phase);
  const round = phase.phase === 'hold' || phase.phase === 'rest' ? phase.round : phase.phase === 'countdown' ? 0 : rounds;
  const holding = phase.phase === 'hold' || phase.phase === 'test';
  const reps = isRepsPlan(plan);
  const label = {
    countdown: t('timedMethod.getReady'), hold: t(reps ? 'timedMethod.workPhase' : 'timedMethod.holdPhase'), rest: t('timedMethod.restPhase'), recovery: t('timedMethod.recoveryPhase'),
    ready: t('timedMethod.readyPhase'), testCountdown: t('timedMethod.getReady'), test: t(reps ? 'timedMethod.maxPhase' : 'timedMethod.testPhase'), done: t('timedMethod.donePhase'),
  }[phase.phase];
  // Reps: the round's reps can be corrected while it runs (work interval and its break), the max set's while counting.
  const counter = !reps ? null
    : phase.phase === 'hold' || phase.phase === 'rest'
      ? { label: t(phase.phase === 'hold' ? 'timedMethod.thisInterval' : 'timedMethod.justDone'), value: repsOfRound(plan, phase.round), onChange: (value: number) => onRoundReps?.(phase.round, value) }
      : phase.phase === 'test' ? { label: t('timedMethod.maxDone'), value: plan.maxReps ?? 0, onChange: (value: number) => onMaxReps?.(value) } : null;
  // Progress of the clock within the phase (the final hold fills towards its goal).
  const total = phase.phase === 'hold' ? plan.holdSec : phase.phase === 'rest' ? plan.restSec : phase.phase === 'recovery' ? plan.recoverySec : phase.phase === 'test' ? plan.testSec : 0;
  const left = phase.phase === 'test' ? plan.testSec - phase.seconds : 'secondsLeft' in phase ? phase.secondsLeft : 0;
  const filled = total > 0 ? Math.min(1, Math.max(0, phase.phase === 'test' ? phase.seconds / plan.testSec : 1 - left / total)) : 0;
  const reached = !reps && phase.phase === 'test' && phase.seconds >= plan.testSec;
  const showStopHint = () => {
    tapFeedback();
    setStopHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setStopHint(false), 3000);
  };
  const primary = plan.stoppedAt !== undefined
    ? { label: t('common.save'), icon: 'save-outline' as const, onPress: onStop }
    : phase.phase === 'recovery'
    ? { label: t('timedMethod.skipRecovery'), icon: 'play-forward' as const, onPress: onSkipRecovery }
    : phase.phase === 'ready' ? { label: reps ? t('timedMethod.startMax') : t('timedMethod.startTest', { seconds: plan.testSec }), icon: 'play' as const, onPress: onStartTest }
      : phase.phase === 'test' ? { label: t(reps ? 'timedMethod.endMax' : 'timedMethod.endTest'), icon: 'stop' as const, onPress: onFinishTest } : null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.stage, { backgroundColor: palette.hero }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.page, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg }]} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <View style={styles.titles}>
            <Text style={[styles.exercise, { color: palette.heroText }]}>{exercise}</Text>
            <Text style={[styles.tag, { color: muted }]}>{t('timedMethod.stepOf', { step }).toUpperCase()}</Text>
          </View>
          <View style={styles.topActions}>
            {onUpdateCues ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('timedMethod.soundSettings')}
                onPress={() => { tapFeedback(); setSoundSheetOpen(true); }}
                style={({ pressed }) => [styles.soundButton, { borderColor: muted }, pressed && styles.pressed]}
              >
                <Icon name={mutedAudio ? 'volume-mute-outline' : 'volume-high-outline'} size={20} color={palette.heroText} />
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel={t('emom.showWorkout')} onPress={() => { tapFeedback(); onClose(); }} style={({ pressed }) => [styles.workoutButton, { borderColor: muted }, pressed && styles.pressed]}>
              <Icon name="list" size={18} color={palette.heroText} />
              <Text style={[styles.tagStrong, { color: palette.heroText }]}>{t('emom.workout').toUpperCase()}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.figures}>
          <View>
            <Text accessibilityLiveRegion="polite" style={[styles.phase, { color: palette.heroText }]}>{label}</Text>
            {phase.phase === 'hold' || phase.phase === 'rest' ? (
              <Text style={[styles.tagWide, { color: muted }]}>{t('timedMethod.round', { round, rounds }).toUpperCase()}</Text>
            ) : phase.phase === 'recovery' ? <Text style={[styles.tagWide, { color: muted }]}>{t(reps ? 'timedMethod.recoveryHintReps' : 'timedMethod.recoveryHint').toUpperCase()}</Text>
              : phase.phase === 'ready' || phase.phase === 'test' ? <Text style={[styles.tagWide, { color: muted }]}>{(reps ? t('timedMethod.maxHint') : t('timedMethod.testGoal', { seconds: plan.testSec })).toUpperCase()}</Text> : null}
          </View>
          <View style={styles.clockBlock}>
            <Text maxFontSizeMultiplier={1} numberOfLines={1} accessibilityRole="timer" accessibilityLabel={`${label} ${timedClock(phase)}`} style={[styles.clock, { color: palette.heroText }]}>{phase.phase === 'ready' ? 'GO' : timedClock(phase)}</Text>
            <View accessible={false} style={[styles.track, { backgroundColor: palette.heroOverlay }]}>
              <View style={[styles.fill, { backgroundColor: palette.heroText, width: `${Math.round(filled * 100)}%` }]} />
            </View>
            {reached ? <Text accessibilityLiveRegion="polite" style={[styles.tagStrong, { color: palette.heroText }]}>{t('timedMethod.goalReached').toUpperCase()}</Text> : null}
          </View>
          {counter ? <RepsCounter {...counter} /> : null}
          {/* One cell per cycle of the block: holds already done are filled, the current one is outlined. */}
          <View style={styles.strip} accessible accessibilityLabel={t('timedMethod.stripLabel', { done: Math.max(0, step > 1 ? rounds : phase.phase === 'rest' ? round : round - 1), rounds })}>
            {Array.from({ length: rounds }, (_, index) => {
              const done = step > 1 || index < round - 1 || (phase.phase === 'rest' && index === round - 1);
              const current = (phase.phase === 'hold' || phase.phase === 'rest') && index === round - 1 && !done;
              return <View key={index} style={[styles.cell, done ? { backgroundColor: palette.heroText } : current ? [styles.cellCurrent, { borderColor: palette.heroText }] : { borderColor: muted, borderWidth: 1 }]} />;
            })}
          </View>
          {holding || reps ? null : <Text style={[styles.caption, { color: muted }]}>{phase.phase === 'rest' ? t('timedMethod.restHint') : ''}</Text>}
        </View>

        <View style={styles.controls}>
          {primary ? (
            <Pressable accessibilityRole="button" accessibilityLabel={primary.label} onPress={() => { tapFeedback('success'); primary.onPress(); }} style={({ pressed }) => [styles.action, largeText && styles.fullRow, { backgroundColor: palette.heroText }, pressed && styles.pressed]}>
              <Icon name={primary.icon} size={22} color={palette.hero} />
              <Text style={[styles.actionText, { color: palette.hero }]}>{primary.label.toUpperCase()}</Text>
            </Pressable>
          ) : null}
          {phase.phase === 'recovery' || phase.phase === 'ready' ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t(reps ? 'timedMethod.finishNoMax' : 'timedMethod.finishNoTest')} onPress={() => { tapFeedback(); onStop(); }} style={({ pressed }) => [styles.action, largeText && styles.fullRow, styles.actionOutline, { borderColor: muted }, pressed && styles.pressed]}>
              <Icon name="flag-outline" size={16} color={palette.heroText} />
              <Text style={[styles.actionTextQuiet, { color: palette.heroText }]}>{t(reps ? 'timedMethod.finishNoMax' : 'timedMethod.finishNoTest')}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('timedMethod.stopAndSave')}
            accessibilityHint={t('timedMethod.holdToSave')}
            accessibilityActions={[{ name: 'longpress', label: t('timedMethod.stopAndSave') }]}
            onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') onStop(); }}
            onPress={showStopHint}
            onLongPress={() => { tapFeedback(); onStop(); }}
            delayLongPress={600}
            style={({ pressed }) => [styles.action, largeText && styles.fullRow, styles.actionOutline, { borderColor: muted }, pressed && styles.pressed]}
          >
            <Icon name="stop" size={16} color={palette.heroText} />
            <Text style={[styles.actionTextQuiet, { color: palette.heroText }]}>{t('timedMethod.holdToSave')}</Text>
          </Pressable>
          {stopHint ? <Text accessibilityLiveRegion="polite" style={[styles.caption, styles.hint, styles.fullRow, { color: palette.heroText }]}>{t('timedMethod.holdToSave')}</Text> : null}
        </View>
      </ScrollView>
      {onUpdateCues ? (
        <Sheet visible={soundSheetOpen} onClose={() => setSoundSheetOpen(false)} title={t('timedMethod.soundSettings')}>
          <TimedCuesEditor cues={resolvedCues} onChange={onUpdateCues} reps={reps} />
        </Sheet>
      ) : null}
    </View>
  );
}

/** Reps of the running round or max set, on the stage: one tap per rep, large enough for a chalky thumb. */
function RepsCounter({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const step = (delta: number) => { tapFeedback(); onChange(Math.max(0, Math.min(999, value + delta))); };
  return (
    <View style={styles.counter}>
      <Text style={[styles.counterLabel, { color: palette.heroTextMuted }]}>{label.toUpperCase()}</Text>
      <View style={styles.counterRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('timedMethod.fewerReps')} disabled={value <= 0} onPress={() => step(-1)} style={({ pressed }) => [styles.counterButton, { backgroundColor: palette.heroOverlay }, (pressed || value <= 0) && styles.pressed]}>
          <Icon name="remove" size={26} color={palette.heroText} />
        </Pressable>
        <Text accessibilityLiveRegion="polite" accessibilityLabel={`${label}: ${t('timedMethod.repsCount', { count: value })}`} style={[styles.counterValue, { color: palette.heroText }]}>{value}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('timedMethod.moreReps')} onPress={() => step(1)} style={({ pressed }) => [styles.counterButton, { backgroundColor: palette.heroOverlay }, pressed && styles.pressed]}>
          <Icon name="add" size={26} color={palette.heroText} />
        </Pressable>
      </View>
    </View>
  );
}

/** The running method in one line at the bottom of the workout; a tap opens the full screen again. */
export function TimedMethodMiniDock({ exercise, phase, reps = false, onOpen }: { exercise: string; phase: TimedMethodPhase; reps?: boolean; onOpen: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const name = { countdown: 'getReady', hold: reps ? 'workPhase' : 'holdPhase', rest: 'restPhase', recovery: 'recoveryPhase', ready: 'readyPhase', testCountdown: 'getReady', test: reps ? 'maxPhase' : 'testPhase', done: 'donePhase' }[phase.phase];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${t(`timedMethod.${name}`)}, ${exercise}, ${timedClock(phase)}`} accessibilityHint={t('emom.openStage')} onPress={() => { tapFeedback(); onOpen(); }} style={({ pressed }) => [styles.mini, { backgroundColor: palette.hero }, pressed && styles.pressed]}>
      <View style={styles.miniText}>
        <Text style={[styles.miniLabel, { color: palette.heroText }]} numberOfLines={2}>{t(`timedMethod.${name}`)}</Text>
        <Text style={[styles.caption, { color: palette.heroTextMuted }]} numberOfLines={1}>{exercise}</Text>
      </View>
      <Text maxFontSizeMultiplier={1.2} accessibilityRole="timer" style={[styles.miniClock, { color: palette.heroText }]}>{phase.phase === 'ready' ? 'GO' : timedClock(phase)}</Text>
      <Icon name="chevron-up" size={22} color={palette.heroText} />
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  stage: { zIndex: 20, elevation: 20 },
  page: { flexGrow: 1, paddingHorizontal: spacing.xl, gap: spacing.md },
  figures: { flexGrow: 1, justifyContent: 'flex-end', gap: spacing.lg, paddingBottom: spacing.xs },
  fullRow: { flexBasis: '100%' },
  scroll: { flex: 1 },
  topRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  soundButton: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: radii.control },
  titles: { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0 },
  exercise: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, textTransform: 'uppercase' },
  tag: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16, letterSpacing: 1 },
  tagStrong: { fontFamily: fonts.monoSemibold, fontSize: 12, lineHeight: 16, letterSpacing: 1 },
  tagWide: { fontFamily: fonts.monoSemibold, fontSize: 13, lineHeight: 18, letterSpacing: 3 },
  workoutButton: { minHeight: MIN_TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderRadius: radii.control },
  phase: { fontFamily: fonts.display, fontSize: 56, lineHeight: 68, letterSpacing: -1, textTransform: 'uppercase' },
  clockBlock: { gap: spacing.sm },
  clock: { fontFamily: fonts.monoBold, fontSize: 96, lineHeight: 100, letterSpacing: -4, fontVariant: ['tabular-nums'] },
  track: { height: 8, overflow: 'hidden' },
  fill: { height: 8 },
  caption: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  cell: { flexGrow: 1, flexBasis: 18, minWidth: 18, maxWidth: 48, minHeight: 28, borderRadius: radii.control },
  cellCurrent: { borderWidth: 2 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: 140, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.control },
  actionOutline: { borderWidth: 1 },
  actionText: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 16, letterSpacing: 0.5, textAlign: 'center' },
  actionTextQuiet: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 15, textAlign: 'center' },
  hint: { textAlign: 'center' },
  pressed: { opacity: 0.7 },
  mini: { minHeight: 56, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.control },
  miniText: { flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 0 },
  miniLabel: { fontFamily: fonts.display, fontSize: 18, lineHeight: 22 },
  miniClock: { fontFamily: fonts.monoBold, fontSize: 28, lineHeight: 32, fontVariant: ['tabular-nums'] },
  counter: { gap: spacing.xs },
  counterLabel: { fontFamily: fonts.monoSemibold, fontSize: 12, lineHeight: 16, letterSpacing: 1 },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  counterButton: { width: 64, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: radii.control },
  counterValue: { flexGrow: 1, flexShrink: 1, textAlign: 'center', fontFamily: fonts.monoBold, fontSize: 44, lineHeight: 52, fontVariant: ['tabular-nums'] },
});
