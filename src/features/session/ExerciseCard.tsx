import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutLeft, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { useRef, type ReactNode } from 'react';
import { compareWithLast } from '../../domain/lastTime';
import { formatRpe } from '../../domain/rpe';
import { completedSetCount, groupSets } from '../../domain/setPairs';
import type { RecordKind } from '../analytics/records';
import { openExercisePage } from '../exercises/openExercise';
import { openReferenceVideo } from '../exercises/ReferenceLinkSheet';
import { HoldDurationField } from '../../shared/components/DateTimePickers';
import { Heading, Icon, IconButton, Label, NumberEdit, tapFeedback, Text, type NumberEditControl } from '../../shared/components/ui';
import { useAnimationSettings } from '../../shared/settings/AnimationProvider';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { formatClock, formatNumber } from '../../shared/utils/format';
import { FormRating, LastTimeStrip } from './LastTime';
import type { PreviousPerformance, SessionExercise, SessionSet } from './repository';
import type { SetBand } from '../../domain/equipment';
import { RpePicker } from './RpePicker';
import { formatLoad, LOAD_STEP_KG, StepButton } from './SetEntry';
import { DoneTint, PopOnActivate, SwipeableSetRow } from './SwipeableSetRow';
import type { ActiveHold } from './useHoldTimer';

const NO_RECORDS: ReadonlyMap<string, RecordKind[]> = new Map();

/**
 * One exercise of a workout as a flat section: header (name, progress, target RPE, last time), then one
 * block per set (set number, value and load steppers, done button, menu; RPE chips; form once done)
 * and the add-set row. Shared by the workout in progress and a finished workout's page; the live-only
 * parts (hold timer, EMOM, comparison with last time, records) are optional.
 */
export function ExerciseCard({ handle, exercise, collapsed, onToggleCollapsed, previous, hold = null, onChange, onSetValue, onComplete, onStartHold, onFinishHold, onAddSet, onAddWarmup, onSetOptions, onUncomplete, onRemoveSet, onSwiped, showRpe, onRpe, onOptions, onToggleWarmup, setRecords = NO_RECORDS, volumeRecord = false, supersetLabel = null, emomLabel: emomBadgeLabel, defaultRest = 0, onFormRating, editDone = false, typeDone = false, compare = true, apparatusLabel = null, firstTimeLabel, describeBands, compareBands }: {
  handle?: ReactNode;
  exercise: SessionExercise;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  previous?: PreviousPerformance;
  /** The running hold; holds are timed only when `onStartHold` is given. */
  hold?: ActiveHold | null;
  onChange: (set: SessionSet, field: 'reps' | 'durationSec' | 'distanceM' | 'addedLoadKg', delta: number) => Promise<void>;
  onSetValue: (set: SessionSet, field: 'reps' | 'durationSec' | 'distanceM' | 'addedLoadKg', value: number) => void;
  onComplete: (set: SessionSet) => void;
  onStartHold?: (set: SessionSet) => void;
  onFinishHold?: () => void;
  onAddSet: () => void;
  onAddWarmup?: () => void;
  onSetOptions: (set: SessionSet) => void;
  onUncomplete: (set: SessionSet) => void;
  onRemoveSet: (set: SessionSet) => void;
  onSwiped?: () => void;
  /** The RPE chips under every working set (Profile can hide them). */
  showRpe: boolean;
  onRpe: (set: SessionSet, rpe: number | null) => void;
  onOptions: () => void;
  onToggleWarmup: (set: SessionSet) => void;
  setRecords?: ReadonlyMap<string, RecordKind[]>;
  volumeRecord?: boolean;
  supersetLabel?: string | null;
  emomLabel?: string | null;
  /** Rest the app applies to a working set without its own, for the rest comparison. */
  defaultRest?: number;
  onFormRating: (set: SessionSet, rating: number | null) => void;
  /** Done sets keep their − and + buttons (a finished workout, where every set is done). */
  editDone?: boolean;
  /** Done sets stay editable by tapping the value, without − and +, so finished rows stay quiet (the workout in progress). */
  typeDone?: boolean;
  /** Shows "last time" (or "first time") in the header; off where there is no last time to show. */
  compare?: boolean;
  /** Name of the apparatus used for this exercise, shown in the header. */
  apparatusLabel?: string | null;
  /** Replaces "first time logging this movement", e.g. "first time on the rings". */
  firstTimeLabel?: string;
  /** Swatches and text for a set's bands ("Blue · 2"), shown under the set. */
  describeBands?: (set: SessionSet) => { colors: string[]; text: string } | null;
  /** Compares two sets' bands by the strength order, for the assistance comparison without kg. */
  compareBands?: (a: readonly SetBand[], b: readonly SetBand[]) => -1 | 0 | 1 | null;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  // The number fields that are open, so − and + step what is typed rather than the saved value.
  const controls = useRef(new Map<string, NumberEditControl>());
  const step = (set: SessionSet, field: Parameters<typeof onChange>[1], delta: number) => {
    const typed = controls.current.get(`${set.id}:${field}`)?.read() ?? null;
    if (typed === null) { void onChange(set, field, delta); return; }
    const next = Math.round((typed + delta) * 100) / 100;
    const value = field === 'addedLoadKg' ? next : Math.max(0, next);
    controls.current.get(`${set.id}:${field}`)?.set(String(value));
    onSetValue(set, field, value);
  };
  const { duration } = useAnimationSettings();
  const setEntering = duration(220) ? FadeInDown.duration(duration(220)) : undefined;
  const itemExiting = duration(200) ? FadeOutLeft.duration(duration(200)) : undefined;
  const rowLayout = duration(240) ? LinearTransition.duration(duration(240)) : undefined;
  const checkEntering = duration(180) ? ZoomIn.duration(duration(180)) : undefined;
  const timed = exercise.metric === 'time' || exercise.metric === 'time_load';
  const distance = exercise.metric === 'distance';
  // Every set can carry added load or assistance, except distance work.
  const withLoad = !distance;
  const field = timed ? 'durationSec' : distance ? 'distanceM' : 'reps';
  const fieldLabel = timed ? t('logger.holdCol') : distance ? t('logger.distanceCol') : t('logger.repsCol');
  const doneSets = completedSetCount(exercise.sets);
  const totalSets = groupSets(exercise.sets).length;
  const allDone = totalSets > 0 && doneSets === totalSets;
  // Folded summary of what was done, with units: "W 5 · 8 · 8 reps", "L 8 · R 8 reps", "0:30 · 0:35", "8 +10 kg".
  const doneValues = exercise.sets.filter((set) => set.completedAt).map((set) => {
    const base = timed ? formatClock(set.durationSec ?? 0) : distance ? `${formatNumber(set.distanceM ?? 0)} m` : String(set.reps ?? 0);
    const side = set.side === 'left' ? 'L ' : set.side === 'right' ? 'R ' : '';
    const label = set.kind === 'warmup' ? `W ${side}${base}` : `${side}${base}`;
    return set.addedLoadKg !== 0 ? `${label} ${formatLoad(set.addedLoadKg)}` : label;
  }).join(' · ');
  const results = doneValues && !timed && !distance ? t('logger.resultsReps', { values: doneValues }) : doneValues;
  const previousText = previous ? describePrevious(previous.sets, exercise.metric) : null;
  const comparison = compareWithLast(exercise.sets, previous?.sets ?? null, exercise.metric, { defaultRest, compareBands });
  const hasComparison = Boolean(comparison.total || comparison.rest || comparison.form || comparison.assist || comparison.assistOrder);
  // Average form of today's rated sets (also when there is nothing to compare it with).
  const ratedForms = exercise.sets.filter((set) => set.completedAt && set.kind === 'working' && set.formRating !== null).map((set) => set.formRating as number);
  const comparisonFormNow = ratedForms.length ? Math.round((ratedForms.reduce((sum, value) => sum + value, 0) / ratedForms.length) * 10) / 10 : null;
  // Mini PRs against last time, for the folded results line.
  const prNotes = [
    comparison.improved.total && comparison.total ? `↑ ${t('lastTime.totalShort', { delta: formatNumber(Math.round(((comparison.total.now ?? 0) - comparison.total.last) * 10) / 10) })}` : null,
    comparison.improved.rest && comparison.rest ? `↑ ${t('lastTime.restShort', { delta: comparison.rest.last - (comparison.rest.now ?? comparison.rest.last) })}` : null,
  ].filter(Boolean);
  // The program's target RPE: one value when the sets agree, else set by set.
  const targets = groupSets(exercise.sets.filter((set) => set.kind === 'working')).map((group) => group[0].targetRpe);
  const targetText = targets.some((value) => value !== null)
    ? (targets.every((value) => value === targets[0]) ? formatRpe(targets[0]!) : targets.map((value) => (value === null ? '–' : formatRpe(value))).join(' · '))
    : null;
  // The set to do next carries the filled button, so the eye lands on it; later sets stay quiet.
  const nextSetId = exercise.sets.find((set) => !set.completedAt)?.id ?? null;

  return (
    <View style={[styles.exerciseSection, { borderTopColor: palette.border }]}>
      <View style={styles.exerciseHeader}>
        {handle}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(collapsed ? 'logger.expand' : 'logger.collapse', { name: exercise.name })}
          accessibilityState={{ expanded: !collapsed }}
          onPress={onToggleCollapsed}
          onLongPress={() => openExercisePage(exercise.exerciseId)}
          accessibilityActions={[{ name: 'longpress', label: t('logger.openExercise') }]}
          onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') openExercisePage(exercise.exerciseId); }}
          style={styles.flex}
        >
          <View style={styles.nameRow}>
            <Heading style={[styles.exerciseName, styles.flex]}>{exercise.name}</Heading>
            <Icon name={collapsed ? 'chevron-down' : 'chevron-up'} size={18} color={palette.textMuted} />
          </View>
          <View style={styles.progressRow}>
            <Icon name={allDone ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={allDone ? palette.success : palette.textMuted} />
            <Label style={allDone ? { color: palette.success } : undefined}>{t('logger.setsProgress', { done: doneSets, total: totalSets })}</Label>
            {targetText ? <Label>{`· @ ${t('logger.rpeTag', { value: targetText })}`}</Label> : null}
            {apparatusLabel ? <Label>{`· ${apparatusLabel}`}</Label> : null}
            {supersetLabel ? <Label style={{ color: palette.accentStrong }}>{`· ${supersetLabel}`}</Label> : null}
            {emomBadgeLabel ? <Label accessibilityLiveRegion="polite" style={{ color: palette.accentStrong }}>{`· ${emomBadgeLabel}`}</Label> : null}
            {volumeRecord ? (
              <View style={[styles.recordChip, { backgroundColor: palette.recordSoft }]}>
                <Icon name="trophy-outline" size={13} color={palette.record} />
                <Text style={[styles.clipChipText, { color: palette.record }]}>{t('records.kinds.volume')}</Text>
              </View>
            ) : null}
          </View>
          {collapsed && results ? <Text numberOfLines={2} style={[styles.results, { color: palette.text }]}>{results}</Text> : null}
          {collapsed && comparisonFormNow !== null ? (
            // Average form with its trend against last time in one line: green ↑ better, red ↓ worse.
            <Label style={comparison.improved.form ? { color: palette.success } : comparison.worse.form ? { color: palette.warning } : undefined}>
              {`${t('lastTime.formAverage', { value: formatNumber(comparisonFormNow) })}${comparison.improved.form ? ' ↑' : comparison.worse.form ? ' ↓' : ''}`}
            </Label>
          ) : null}
          {collapsed && prNotes.length ? <Text numberOfLines={2} style={[styles.prNotes, { color: palette.success }]}>{prNotes.join(' · ')}</Text> : null}
          {collapsed || hasComparison || !compare ? null : <Label>{previousText ? t('logger.lastTime', { value: previousText }) : firstTimeLabel ?? t('logger.firstTime')}</Label>}
          {exercise.notes ? <Text numberOfLines={3} style={[styles.exerciseNote, { color: palette.textMuted }]}>{exercise.notes}</Text> : null}
        </Pressable>
        {exercise.demoUrl ? (
          <IconButton icon="play-circle-outline" label={t('logger.referenceOpen')} tone="plain" onPress={() => openReferenceVideo(exercise.demoUrl!)} />
        ) : null}
        <IconButton icon="ellipsis-vertical" label={t('logger.options')} tone="plain" onPress={onOptions} />
      </View>
      {!collapsed && hasComparison && previous ? (
        <LastTimeStrip
          comparison={comparison}
          metric={exercise.metric}
          date={previous.workoutStartedAt.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })}
          detail={previousText ?? ''}
          compact={exercise.sets.some((set) => set.completedAt)}
        />
      ) : null}

      {collapsed ? null : <View style={styles.columns}>
        <Label style={[styles.colSet, styles.colHeader]}>{t('logger.setCol')}</Label>
        <Label style={[styles.colValue, styles.colHeader]}>{timed ? t('logger.holdCol') : distance ? t('logger.distanceCol') : t('logger.repsCol')}</Label>
        {withLoad ? <Label style={[styles.colLoad, styles.colHeader]}>{t('logger.kgCol')}</Label> : null}
        <View style={styles.colAction} />
        <View style={styles.colMenu} />
      </View>}

      {(collapsed ? [] : exercise.sets).map((set) => {
        const done = Boolean(set.completedAt);
        // In a running EMOM a recorded round stays editable in place and keeps its check, so the round count holds.
        const emomLocked = done && Boolean(emomBadgeLabel);
        // Done rows drop − and +: a running EMOM or a long workout would otherwise be a wall of buttons.
        const showSteps = !done || editDone;
        const editableDone = editDone || typeDone || emomLocked;
        const workingNumber = groupSets(exercise.sets.filter((item) => item.kind === 'working' && item.index <= set.index)).length;
        const sideLabel = set.side === 'left' ? t('logger.sideLeft') : set.side === 'right' ? t('logger.sideRight') : '';
        const holding = hold?.setId === set.id;
        // A held press anywhere on the set opens the same menu as its three dots.
        const openMenu = () => { tapFeedback(); onSetOptions(set); };
        const stored = timed ? set.durationSec ?? 0 : distance ? set.distanceM ?? 0 : set.reps ?? 0;
        const value = holding && hold ? holdDisplay(hold) : timed ? formatClock(stored) : distance ? formatNumber(stored) : String(stored);
        const loadText = set.addedLoadKg === 0 ? '0' : formatLoad(set.addedLoadKg).replace(' kg', '');
        const rpeRow = showRpe && set.kind === 'working' && !emomBadgeLabel;
        return (
          <Animated.View key={set.id} entering={setEntering} exiting={itemExiting} layout={rowLayout} style={styles.setBlock}>
            <DoneTint done={done} color={palette.accentSoft} />
            <SwipeableSetRow
              done={done}
              onPage
              completeLabel={t('logger.swipeComplete')}
              reopenLabel={t('logger.swipeReopen')}
              removeLabel={t('logger.swipeRemove')}
              onSwipeRight={() => { onSwiped?.(); if (done) onUncomplete(set); else onComplete(set); }}
              onSwipeLeft={() => { onSwiped?.(); onRemoveSet(set); }}
            >
            {/* Row 1: set, reps (or time, or distance), load, done, menu. */}
            <Pressable accessible={false} accessibilityRole="none" onLongPress={openMenu} delayLongPress={450} style={styles.setRow}>
              <View style={styles.colSet}>
                <PopOnActivate active={done}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={set.kind === 'warmup' ? t('logger.warmupOn') : t('logger.warmupOff', { number: workingNumber })}
                    accessibilityHint={t('logger.warmupHint')}
                    hitSlop={8}
                    onPress={() => onToggleWarmup(set)}
                    onLongPress={openMenu}
                    delayLongPress={450}
                    style={[styles.setBadge, { backgroundColor: palette.surfaceMuted }, set.kind === 'warmup' && { borderWidth: 1, borderStyle: 'dashed', borderColor: palette.textMuted }]}
                  >
                    <Text style={[styles.setBadgeText, { color: set.kind === 'warmup' ? palette.textMuted : palette.text }]}>{set.kind === 'warmup' ? 'W' : workingNumber}</Text>
                    {set.side === 'left' || set.side === 'right' ? <Text style={[styles.setBadgeSide, { color: palette.textMuted }]}>{set.side === 'left' ? 'L' : 'R'}</Text> : null}
                  </Pressable>
                </PopOnActivate>
              </View>
              <View style={[styles.colValue, styles.stepper]}>
                {showSteps ? <StepButton icon="remove" label={t('logger.stepDown', { field: fieldLabel, number: workingNumber, side: sideLabel }).trim()} onPress={(multiplier) => step(set, field, (distance ? -0.5 : timed ? -5 : -1) * multiplier)} /> : null}
                {(done && !editableDone) || holding ? (
                  <Text style={[styles.setValue, { color: holding ? palette.accentStrong : palette.text }]}>{value}</Text>
                ) : timed ? (
                  <HoldDurationField compact value={stored} label={`${t('logger.holdCol')} · ${t('logger.editValue', { number: set.index })}`} onChange={(next) => onSetValue(set, 'durationSec', next)} />
                ) : (
                  <NumberEdit
                    value={stored}
                    display={value}
                    label={`${t('logger.editValue', { number: set.index })} ${sideLabel}`}
                    onCommit={(next) => onSetValue(set, field, field === 'reps' ? Math.round(next) : next)}
                    onControl={(control) => { controls.current.set(`${set.id}:${field}`, control); }}
                    onLongPress={openMenu}
                    style={[styles.setValue, { color: palette.text }]}
                  />
                )}
                {showSteps ? <StepButton icon="add" label={t('logger.stepUp', { field: fieldLabel, number: workingNumber, side: sideLabel }).trim()} onPress={(multiplier) => step(set, field, (distance ? 0.5 : timed ? 5 : 1) * multiplier)} /> : null}
              </View>
              {withLoad ? (
                <View style={[styles.colLoad, styles.stepper]}>
                  {showSteps ? <StepButton icon="remove" label={t('logger.stepDown', { field: t('history.addedLoad'), number: workingNumber, side: sideLabel }).trim()} onPress={(multiplier) => step(set, 'addedLoadKg', -LOAD_STEP_KG * multiplier)} /> : null}
                  {done && !editableDone ? (
                    <Text style={[styles.loadValue, { color: set.addedLoadKg === 0 ? palette.textMuted : palette.text }]}>{loadText}</Text>
                  ) : (
                    <NumberEdit
                      value={set.addedLoadKg}
                      display={loadText}
                      allowNegative
                      label={`${t('history.addedLoad')} ${sideLabel}`}
                      onCommit={(next) => onSetValue(set, 'addedLoadKg', next)}
                      onControl={(control) => { controls.current.set(`${set.id}:addedLoadKg`, control); }}
                      onLongPress={openMenu}
                      style={[styles.loadValue, { color: set.addedLoadKg === 0 ? palette.textMuted : palette.text }]}
                    />
                  )}
                  {showSteps ? <StepButton icon="add" label={t('logger.stepUp', { field: t('history.addedLoad'), number: workingNumber, side: sideLabel }).trim()} onPress={(multiplier) => step(set, 'addedLoadKg', LOAD_STEP_KG * multiplier)} /> : null}
                </View>
              ) : null}
              <View style={styles.colAction}>
                {done ? (
                  <Animated.View entering={checkEntering}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t('workout.setCompleted')} ${sideLabel}`}
                      accessibilityState={{ checked: true, disabled: emomLocked }}
                      accessibilityHint={emomLocked ? t('emom.editHint') : undefined}
                      disabled={emomLocked}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 0 }}
                      onPress={() => onUncomplete(set)}
                      onLongPress={openMenu}
                      delayLongPress={450}
                      style={({ pressed }) => [styles.checkButton, { backgroundColor: palette.success }, pressed && styles.checkPressed]}
                    >
                      <Icon name="checkmark" size={20} color={palette.successText} />
                    </Pressable>
                  </Animated.View>
                ) : timed && onStartHold ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${holding ? t('logger.doneHold') : t('logger.startHold')} ${sideLabel}`}
                    accessibilityHint={holding ? undefined : t('logger.holdLongPressHint')}
                    accessibilityActions={holding ? undefined : [{ name: 'longpress', label: t('logger.markDoneNoTimer') }]}
                    onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') onComplete(set); }}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 0 }}
                    onPress={() => holding ? onFinishHold?.() : onStartHold(set)}
                    onLongPress={holding ? undefined : () => { tapFeedback(); onComplete(set); }}
                    delayLongPress={400}
                    style={({ pressed }) => [styles.checkButton, holding || set.id === nextSetId ? { backgroundColor: palette.accent } : { backgroundColor: palette.surfaceMuted }, pressed && styles.checkPressed]}
                  >
                    <Icon name={holding ? 'stop' : 'play'} size={18} color={holding || set.id === nextSetId ? palette.accentText : palette.text} />
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('workout.completeSet')} ${sideLabel}`}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 0 }}
                    onPress={() => onComplete(set)}
                    onLongPress={openMenu}
                    delayLongPress={450}
                    style={({ pressed }) => [styles.checkButton, set.id === nextSetId ? { backgroundColor: palette.accent } : { backgroundColor: palette.surfaceMuted, borderColor: palette.border, borderWidth: 1 }, pressed && styles.checkPressed]}
                  >
                    <Icon name="checkmark" size={20} color={set.id === nextSetId ? palette.accentText : palette.textMuted} />
                  </Pressable>
                )}
              </View>
              <View style={styles.colMenu}>
                {/* The touch area grows only towards the screen edge, never over the done button beside it. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('logger.setOptions', { number: set.index })}
                  hitSlop={{ top: 0, bottom: 0, left: 0, right: 12 }}
                  onPress={() => { tapFeedback(); onSetOptions(set); }}
                  style={({ pressed }) => [styles.menuButton, pressed && { opacity: 0.6 }]}
                >
                  <Icon name="ellipsis-vertical" size={18} color={palette.textMuted} />
                </Pressable>
              </View>
            </Pressable>
            </SwipeableSetRow>
            {/* Row 2: how hard it was. */}
            {rpeRow ? <RpePicker compact sideLabel={sideLabel} value={set.rpe} target={set.targetRpe} onChange={(rpe) => onRpe(set, rpe)} /> : null}
            {/* Row 3, once the set is done: how clean the form was. The exercise folds only after the last rating. */}
            {done && set.kind === 'working' && !emomBadgeLabel ? <FormRating value={set.formRating} sideLabel={sideLabel} onChange={(rating) => onFormRating(set, rating)} /> : null}
            {/* Only when there is something to show: PR, clips, note (and RPE when its row is hidden). */}
            {set.note || set.clipCount > 0 || (set.poseCount ?? 0) > 0 || (!rpeRow && set.rpe !== null) || setRecords.has(set.id) || set.bands.length > 0 ? (
              <Pressable accessibilityRole="button" onPress={() => onSetOptions(set)} style={styles.setMeta}>
                {(() => {
                  const described = set.bands.length > 0 ? describeBands?.(set) : null;
                  return described ? (
                    <View accessibilityLabel={described.text} style={[styles.clipChip, { backgroundColor: palette.surface }]}>
                      {described.colors.map((color, index) => <View key={`${color}-${index}`} style={[styles.bandDot, { backgroundColor: color, borderColor: palette.border }]} />)}
                      <Text style={[styles.clipChipText, { color: palette.text }]}>{described.text}</Text>
                    </View>
                  ) : null;
                })()}
                {setRecords.has(set.id) ? (
                  <View
                    accessibilityLabel={setRecords.get(set.id)!.map((kind) => t(`records.kinds.${kind}`)).join(', ')}
                    style={[styles.clipChip, { backgroundColor: palette.recordSoft }]}
                  >
                    <Icon name="trophy" size={13} color={palette.record} />
                    <Text style={[styles.clipChipText, { color: palette.record }]}>{t('records.pr')}</Text>
                  </View>
                ) : null}
                {!rpeRow && set.rpe !== null ? (
                  <View style={[styles.clipChip, { backgroundColor: palette.surface }]}>
                    <Icon name="speedometer-outline" size={13} color={palette.accentStrong} />
                    <Text style={[styles.clipChipText, { color: palette.accentStrong }]}>{t('logger.rpeTag', { value: formatRpe(set.rpe) })}</Text>
                  </View>
                ) : null}
                {set.clipCount > 0 ? (
                  <View style={[styles.clipChip, { backgroundColor: palette.surface }]}>
                    <Icon name="videocam" size={13} color={palette.accentStrong} />
                    <Text style={[styles.clipChipText, { color: palette.accentStrong }]}>{t('logger.clip', { count: set.clipCount })}</Text>
                  </View>
                ) : null}
                {(set.poseCount ?? 0) > 0 ? (
                  <View accessibilityLabel={t('poseLink.setActionCount', { count: set.poseCount })} style={[styles.clipChip, { backgroundColor: palette.surface }]}>
                    <Icon name="scan-outline" size={13} color={palette.accentStrong} />
                    <Text style={[styles.clipChipText, { color: palette.accentStrong }]}>{set.poseCount}</Text>
                  </View>
                ) : null}
                {set.note ? <Icon name="chatbubble-ellipses-outline" size={14} color={palette.textMuted} /> : null}
                {set.note ? <Text numberOfLines={2} style={[styles.setNote, { color: palette.textMuted }]}>{set.note}</Text> : null}
              </Pressable>
            ) : null}
          </Animated.View>
        );
      })}

      {collapsed ? null : <View style={styles.addRow}>
        <Pressable accessibilityRole="button" onPress={() => { tapFeedback(); onAddSet(); }} style={({ pressed }) => [styles.addSet, { opacity: pressed ? 0.6 : 1 }]}>
          <Icon name="add" size={18} color={palette.accentStrong} />
          <Text style={[styles.addSetText, { color: palette.accentStrong }]}>{t('logger.addSet')}</Text>
        </Pressable>
        {onAddWarmup ? (
          <Pressable accessibilityRole="button" accessibilityHint={t('logger.warmupHint')} onPress={() => { tapFeedback(); onAddWarmup(); }} style={({ pressed }) => [styles.addSet, { opacity: pressed ? 0.6 : 1 }]}>
            <Icon name="flame-outline" size={18} color={palette.textMuted} />
            <Text style={[styles.addSetText, { color: palette.textMuted }]}>{t('logger.addWarmup')}</Text>
          </Pressable>
        ) : null}
      </View>}

    </View>
  );
}

/** Last time's sets for the header; L/R pairs are listed per side instead of interleaved. */
export function describePrevious(sets: PreviousPerformance['sets'], metric: string): string {
  const sided = sets.some((set) => set.side === 'left' || set.side === 'right');
  if (!sided) return sets.map((set) => describePreviousSet(set, metric)).join(' · ');
  const side = (which: 'left' | 'right', letter: string) => {
    const values = sets.filter((set) => set.side === which).map((set) => describePreviousSet(set, metric));
    return values.length ? `${letter} ${values.join(' · ')}` : null;
  };
  return [side('left', 'L'), side('right', 'R')].filter(Boolean).join('  |  ');
}


export function describePreviousSet(set: PreviousPerformance['sets'][number], metric: string): string {
  const base = metric === 'time' || metric === 'time_load'
    ? `${set.durationSec ?? 0}s`
    : metric === 'distance'
      ? `${formatNumber(set.distanceM ?? 0)}m`
      : String(set.reps ?? 0);
  const loaded = metric === 'reps_load' || metric === 'time_load';
  const withLoad = !loaded || set.addedLoadKg === 0 ? base : `${base} ${formatLoad(set.addedLoadKg)}`;
  return set.rpe !== null ? `${withLoad} (RPE ${formatRpe(set.rpe)})` : withLoad;
}

/** Value shown in the set row and timer bar while a hold runs. */
export function holdDisplay(hold: ActiveHold): string {
  if (hold.phase.phase === 'countdown') return String(hold.phase.secondsLeft);
  if (hold.phase.phase === 'running' && hold.phase.remaining !== null) return formatClock(hold.phase.remaining);
  return formatClock(hold.phase.elapsed);
}

const baseStyles = StyleSheet.create({
  bandDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
  flex: { flex: 1 },
  // Exercises are flat sections divided by a hairline, not cards: more room for the sets.
  exerciseSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, gap: 8 },
  exerciseHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4, marginBottom: 4 },
  results: { fontFamily: fonts.semibold, fontSize: 15, marginTop: 2 },
  prNotes: { fontFamily: fonts.semibold, fontSize: 13 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 5 },
  exerciseName: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28 },
  // Column labels only: the section's hairline above already separates it, a second line would be noise.
  columns: { flexDirection: 'row', alignItems: 'center', paddingLeft: 2 },
  colSet: { width: 40 },
  colValue: { flex: 1, textAlign: 'center' },
  colLoad: { flex: 1, textAlign: 'center' },
  colHeader: { textAlign: 'center' },
  colAction: { width: 44, alignItems: 'center' },
  colMenu: { width: 36, alignItems: 'center' },
  menuButton: { width: 36, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  setBlock: { borderRadius: 10, overflow: 'hidden', marginBottom: 8 },
  setRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingTop: 4, paddingLeft: 2 },
  recordChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  setMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 40, paddingRight: 12, paddingBottom: 8 },
  clipChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, minHeight: 24, borderRadius: 999 },
  clipChipText: { fontFamily: fonts.semibold, fontSize: 12 },
  setNote: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  exerciseNote: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, marginTop: 4 },
  setBadge: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  setBadgeText: { fontFamily: fonts.display, fontSize: 16 },
  setBadgeSide: { fontFamily: fonts.semibold, fontSize: 10, lineHeight: 11, marginTop: -2 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  setValue: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, minWidth: 34, textAlign: 'center', fontVariant: ['tabular-nums'] },
  loadValue: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, minWidth: 34, textAlign: 'center', fontVariant: ['tabular-nums'] },
  checkButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  checkPressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },
  addSet: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 4 },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20 },
  addSetText: { fontFamily: fonts.semibold, fontSize: 15 },
});
