import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { compareWithLast } from '../../domain/lastTime';
import { formatRpe } from '../../domain/rpe';
import { completedSetCount, groupSets } from '../../domain/setPairs';
import type { RecordKind } from '../analytics/records';
import { openExercisePage } from '../exercises/openExercise';
import { openReferenceVideo } from '../exercises/ReferenceLinkSheet';
import { HoldDurationField } from '../../shared/components/DateTimePickers';
import { Heading, Icon, IconButton, Label, NumberEdit, ProgressMeter, tapFeedback, Text, TextField, type NumberEditControl } from '../../shared/components/ui';
import { totalProgress } from '../../domain/totalGoal';
import { useAnimationSettings } from '../../shared/settings/AnimationProvider';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { instrument, MIN_TOUCH_TARGET, radii, spacing } from '../../shared/theme/tokens';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { formatClock, formatNumber } from '../../shared/utils/format';
import { Gauge, RegistrationMarks, Tag, useInk } from './instrument';
import { readBooleanPreference, writePreference } from '../../shared/settings/preferences';
import { ChipsFold } from './ChipsFold';
import { LedgerActiveRow, LedgerDoneRow, LedgerHeader, LedgerUpcomingRow } from './LedgerSet';
import { BandsStrip, DetailsToggle, MeasureBox, PreviousSetBox, RatingCells, WorkOutput, gaugeMax, type RatingCell } from './ActiveSetParts';
import { FormRating, LastTimeStrip } from './LastTime';
import type { PreviousPerformance, SessionExercise, SessionSet } from './repository';
import type { SetBand } from '../../domain/equipment';
import { RpePicker } from './RpePicker';
import { formatLoad, LOAD_STEP_KG, StepButton } from './SetEntry';
import { DoneTint, PopOnActivate, SwipeableSetRow } from './SwipeableSetRow';
import type { ActiveHold } from './useHoldTimer';

/** Narrowest screen width, in dp, that lists the sets as table rows. */
const TABLE_MIN_WIDTH = 300;

const NO_RECORDS: ReadonlyMap<string, RecordKind[]> = new Map();

/**
 * One exercise of a workout as a flat section: header (name, progress, target RPE, last time), then one
 * block per set (set number, value and load steppers, done button, menu; RPE chips; form once done)
 * and the add-set row. Shared by the workout in progress and a finished workout's page; the live-only
 * parts (hold timer, EMOM, comparison with last time, records) are optional.
 */
const BANDS_FOLDED_KEY = 'workout.bandsFolded';

/** The Add set button draws 32 dp tall; these bring it and its chevron (36 dp wide) to a 48 dp touch area. */
const ADD_SLOP = { top: spacing.sm, bottom: spacing.sm, left: spacing.sm, right: 0 };
const ADD_MORE_SLOP = { top: spacing.sm, bottom: spacing.sm, left: 0, right: spacing.md };

export function ExerciseCard({ handle, exercise, collapsed, onToggleCollapsed, previous, hold = null, onChange, onSetValue, onComplete, onStartHold, onFinishHold, onAddSet, onAddWarmup, onCopyAllLast, onSetOptions, onUncomplete, onRemoveSet, onSwiped, showRpe, onRpe, onOptions, onToggleWarmup, setRecords = NO_RECORDS, volumeRecord = false, sameLoadRecord = null, supersetLabel = null, emomLabel: emomBadgeLabel, defaultRest = 0, onFormRating, onRomRating, onNote, focus = false, nowLabel = null, figure = null, editDone = false, typeDone = false, compare = true, apparatusLabel = null, firstTimeLabel, describeBands, compareBands, renderBandsEditor, fixedAction = false, onSetExpanded }: {
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
  /** Fills every open set from last time's matching set; given only when there is one to fill. */
  onCopyAllLast?: () => void;
  /** Opens the set's sheet; `view` goes straight to its bands or its note. */
  onSetOptions: (set: SessionSet, view?: 'bands' | 'note' | 'rest') => void;
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
  /** Mini-PR: more total reps (or seconds) than ever at this load with the same number of sets. */
  sameLoadRecord?: { loadKg: number; sets: number; gain: number } | null;
  supersetLabel?: string | null;
  emomLabel?: string | null;
  /** Rest the app applies to a working set without its own, for the rest comparison. */
  defaultRest?: number;
  onFormRating: (set: SessionSet, rating: number | null) => void;
  /** Range-of-motion chips under each working set, like the RPE row (visible for the set in hand and the done ones). */
  onRomRating?: (set: SessionSet, rating: number | null) => void;
  /** Saves a set's note typed in place; without it the Note chip opens the set's sheet. */
  onNote?: (set: SessionSet, note: string) => void;
  /** Marks the exercise in hand ("Now · 2 of 5"); null for the others. */
  nowLabel?: string | null;
  /** Position of the exercise in the workout, shown as "Fig. 02" on its card. */
  figure?: number | null;
  /** Focus mode: the set in hand opens as a large one-column block, the others fold to one line. */
  focus?: boolean;
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
  /** Called when the user expands a set of this exercise (a row, "open all", or a folded set in focus mode). */
  onSetExpanded?: () => void;
  /** Focus mode: the action of the next set is fixed above the screen footer, so the card leaves its own button out. */
  fixedAction?: boolean;
  /** The band editor shown under the set in hand in focus mode (saves through the equipment repository). */
  renderBandsEditor?: (set: SessionSet) => ReactNode;
  /** Compares two sets' bands by the strength order, for the assistance comparison without kg. */
  compareBands?: (a: readonly SetBand[], b: readonly SetBand[]) => -1 | 0 | 1 | null;
}) {
  const styles = useScaledStyles(baseStyles);
  const { width: windowWidth } = useWindowDimensions();
  const ink = useInk();
  const { t, i18n } = useTranslation();
  // Very large text: each set stacks its fields (reps, then kg, then done) instead of one tight row.
  const { palette, largeText: textIsLarge, setLayout, layoutScale } = useTheme();
  // Focus mode stacks the set in hand like very large text does: big fields, one set at a time.
  const largeText = textIsLarge || focus;
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
  // Sets only fade in when added: no layout or exit animations, which made rows flicker and vanish
  // while the card above or around them changed height.
  const setEntering = duration(180) ? FadeIn.duration(duration(180)) : undefined;
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
  const hasComparison = Boolean(comparison.total || comparison.rest || comparison.form || comparison.rom || comparison.assist || comparison.assistOrder);
  // Average form of today's rated sets (also when there is nothing to compare it with).
  const ratedForms = exercise.sets.filter((set) => set.completedAt && set.kind === 'working' && set.formRating !== null).map((set) => set.formRating as number);
  const comparisonFormNow = ratedForms.length ? Math.round((ratedForms.reduce((sum, value) => sum + value, 0) / ratedForms.length) * 10) / 10 : null;
  const ratedRoms = exercise.sets.filter((set) => set.completedAt && set.kind === 'working' && set.romRating !== null).map((set) => set.romRating as number);
  const comparisonRomNow = ratedRoms.length ? Math.round((ratedRoms.reduce((sum, value) => sum + value, 0) / ratedRoms.length) * 10) / 10 : null;
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
  // A total goal: how much of it the done sets cover, shown as "32 / 50 reps".
  const goal = exercise.totalTarget != null ? totalProgress(exercise.sets, exercise.metric, exercise.totalTarget) : null;
  const goalAmount = (value: number) => (timed ? formatClock(Math.round(value)) : distance ? `${formatNumber(value)} m` : formatNumber(value));
  const goalUnit = timed || distance ? '' : ` ${t('history.units.reps')}`;
  // Large text opens one set at a time: the one being held, else the one tapped (until it is done or
  // reopened), else the next to do.
  const [picked, setPicked] = useState<{ id: string; done: boolean } | null>(null);
  // Table rows (normal text): sets opened or closed by hand. Without an entry a set is open while it is in hand
  // (running hold, next to do) or just done and not yet rated for form.
  const [expanded, setExpanded] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  // Large text: the set in hand can be folded to its one-line summary by its title, and opened again the same way.
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const toggleFold = (setId: string) => setFolded((current) => {
    const next = new Set(current);
    if (next.has(setId)) next.delete(setId); else next.add(setId);
    return next;
  });
  const unfold = (setId: string) => { onSetExpanded?.(); setFolded((current) => {
    if (!current.has(setId)) return current;
    const next = new Set(current);
    next.delete(setId);
    return next;
  }); };
  const forget = (setId: string) => setExpanded((current) => {
    if (!current.has(setId)) return current;
    const next = new Map(current);
    next.delete(setId);
    return next;
  });
  // Completing or reopening a set lets the focus move to the next set to do.
  // Completing a set drops every manual choice: the done set folds and the next one opens by itself.
  const complete = (set: SessionSet) => { setPicked(null); setExpanded(new Map()); onComplete(set); };
  const uncomplete = (set: SessionSet) => { setPicked(null); forget(set.id); onUncomplete(set); };
  // Sets where "+ kg" was tapped: a set with no load shows only that chip until then.
  const [loadShown, setLoadShown] = useState<ReadonlySet<string>>(() => new Set());
  const pickedSet = picked ? exercise.sets.find((set) => set.id === picked.id && Boolean(set.completedAt) === picked.done) : undefined;
  // RPE, form and ROM pickers fold into value chips once a set is rated and a later set is done; a tap on the chip reopens its picker.
  // Opened or closed by hand with the chip of that value; without an entry the default below applies.
  // Which value of a set is being edited (its chip is selected and its scale shows below); chosen by hand, else the default below.
  const [chosen, setChosen] = useState<ReadonlyMap<string, 'rpe' | 'form' | 'rom' | 'note' | null>>(() => new Map());
  const toggleOpen = (setId: string, kind: 'rpe' | 'form' | 'rom' | 'note', isOpen: boolean) => { tapFeedback(); setChosen((current) => new Map(current).set(setId, isOpen ? null : kind)); };
  // Focus mode: the set whose band editor is open below its band strip.
  const [bandsEditing, setBandsEditing] = useState<string | null>(null);
  // The band section folds to one line; the choice is kept between sets and workouts.
  const [bandsFolded, setBandsFolded] = useState(() => readBooleanPreference(BANDS_FOLDED_KEY, false));
  const toggleBandsFolded = () => { setBandsFolded(!bandsFolded); writePreference(BANDS_FOLDED_KEY, String(!bandsFolded)); };
  const [detailsOpen, setDetailsOpen] = useState<ReadonlySet<string>>(() => new Set());
  // Sets whose chips are unfolded; folded by default so the sets read as values, not as rows of buttons.
  const [chipsOpen, setChipsOpen] = useState<ReadonlySet<string>>(() => new Set());
  // The "more ways to add" list under the Add set button (warm-up); closed by default and after each choice.
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  // Sets whose telemetry (RPE, form, ROM and their pickers) is unfolded; folded by default.
  const [telemetryOpen, setTelemetryOpen] = useState<ReadonlySet<string>>(() => new Set());
  // Bands belong in the set in hand when the exercise already uses them, now or last time.
  const bandsInUse = exercise.sets.some((item) => item.bands.length > 0) || Boolean(previous?.sets.some((item) => (item.bands?.length ?? 0) > 0));
  const lastDoneId = [...exercise.sets].reverse().find((set) => set.completedAt)?.id ?? null;
  // Normal text lists the sets as table rows that open on a tap; very large text, a finished workout and a running
  // EMOM keep their own layouts.
  // A very narrow screen (display zoom) keeps the set blocks too: five columns plus the tail do not fit.
  const table = !largeText && !editDone && !emomBadgeLabel && windowWidth >= TABLE_MIN_WIDTH && setLayout.rows === 'table';
  const bigButtons = setLayout.buttons === 'large';
  // The done button never shrinks below the touch target with the interface size, so it stays easy to hit at 70 %.
  const doneSize = (base: number) => Math.max(MIN_TOUCH_TARGET, Math.round(base * layoutScale));
  const checkBtn = doneSize(bigButtons ? 52 : 44);
  const checkBox = { width: checkBtn, height: checkBtn };
  const tableCheckSize = doneSize(bigButtons ? 56 : MIN_TOUCH_TARGET - spacing.xs);
  const tableCheckBox = { width: tableCheckSize, height: tableCheckSize };
  const checkLeft = setLayout.check === 'left';
  // A set is open when the user said so, else the one in hand (or just done, still to rate); the others show one line.
  const openOf = (set: SessionSet) => table && (expanded.get(set.id) ?? (hold?.setId === set.id || set.id === nextSetId || (!!set.completedAt && set.id === lastDoneId && set.kind === 'working' && set.formRating === null)));
  // One set open at a time: opening one folds the rest. "Open all" is the explicit way to see every set.
  const openOnly = (setId: string) => { onSetExpanded?.(); setExpanded(new Map(exercise.sets.map((item) => [item.id, item.id === setId] as const))); };
  const setAllOpen = (value: boolean) => { if (value) onSetExpanded?.(); setExpanded(new Map(exercise.sets.map((item) => [item.id, value] as const))); };
  const allOpen = table && exercise.sets.length > 1 && exercise.sets.every(openOf);
  const focusedId = hold && exercise.sets.some((set) => set.id === hold.setId) ? hold.setId : pickedSet?.id ?? nextSetId;
  // Last time's value of the same set (same position and kind, same side for L/R pairs): the marker on the set's gauge.
  const previousMatchFor = (set: SessionSet) => {
    if (!previous) return null;
    const number = groupSets(exercise.sets.filter((item) => item.kind === set.kind && item.index <= set.index)).length;
    const group = groupSets(set.kind === 'warmup' ? previous.warmups : previous.sets)[number - 1];
    return group?.find((item) => !set.pairId || item.side === set.side || !item.side || item.side === 'both') ?? null;
  };
  const ghostFor = (set: SessionSet): number | null => {
    const match = previousMatchFor(set);
    if (!match) return null;
    return (timed ? match.durationSec : distance ? match.distanceM : match.reps) ?? null;
  };

  return (
    <View
      // Always an opaque card: the dot grid stays outside the exercises and their sets, at every text size.
      style={[styles.exerciseCard, { backgroundColor: palette.surface, borderColor: nowLabel ? palette.accentStrong : ink }]}
    >
      <RegistrationMarks />
      {nowLabel ? <View pointerEvents="none" style={[styles.halo, { borderColor: palette.accentSoft }]} /> : null}
      {/* Empty space in the header block (figure tag, name row, the card's top and right edge, and the bottom edge when folded) folds or unfolds the exercise; the chevron stays the labelled control. */}
      <Pressable
        accessible={false}
        accessibilityRole="none"
        onPress={onToggleCollapsed}
        style={[styles.headerTap, collapsed && styles.headerTapFolded]}
      >
      {(table || focus) && (figure !== null || nowLabel) ? (
        <Tag color={nowLabel ? palette.accentStrong : undefined} style={styles.nowRow}>{[figure !== null ? `Fig. ${String(figure).padStart(2, '0')}` : null, nowLabel].filter(Boolean).join(' · ')}</Tag>
      ) : nowLabel ? <Label style={[styles.nowRow, { color: palette.accentStrong }]}>{nowLabel}</Label> : null}
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
            <Heading style={[styles.exerciseName, table && styles.exerciseNameCard, styles.flex]}>{exercise.name}</Heading>
          </View>
          <View style={styles.progressRow}>
            <Icon name={allDone ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={allDone ? palette.success : palette.textMuted} />
            {goal ? (
              <Label style={goal.reached ? { color: palette.success } : undefined}>{`${t('totalGoal.label')} · ${t('totalGoal.setsDone', { count: doneSets })}`}</Label>
            ) : (
              <Label style={allDone ? { color: palette.success } : undefined}>{t('logger.setsProgress', { done: doneSets, total: totalSets })}</Label>
            )}
            {targetText ? <Label>{`· @ ${t('logger.rpeTag', { value: targetText })}`}</Label> : null}
            {apparatusLabel ? <Label>{`· ${apparatusLabel}`}</Label> : null}
            {supersetLabel ? <Label style={{ color: palette.accentStrong }}>{`· ${supersetLabel}`}</Label> : null}
            {emomBadgeLabel ? <Label accessibilityLiveRegion="polite" style={{ color: palette.accentStrong }}>{`· ${emomBadgeLabel}`}</Label> : null}
            {sameLoadRecord ? (
              <View style={[styles.recordChip, { backgroundColor: palette.recordSoft }]}>
                <Icon name="trophy-outline" size={13} color={palette.record} />
                <Text style={[styles.clipChipText, { color: palette.record }]}>
                  {t(sameLoadRecord.loadKg === 0 ? 'records.sameLoadBody' : 'records.sameLoad', { sets: sameLoadRecord.sets, load: formatNumber(sameLoadRecord.loadKg), gain: formatNumber(sameLoadRecord.gain) })}
                </Text>
              </View>
            ) : null}
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
          {collapsed && comparisonRomNow !== null ? (
            <Label style={comparison.improved.rom ? { color: palette.success } : comparison.worse.rom ? { color: palette.warning } : undefined}>
              {`${t('lastTime.romAverageValue', { value: formatNumber(comparisonRomNow) })}${comparison.improved.rom ? ' ↑' : comparison.worse.rom ? ' ↓' : ''}`}
            </Label>
          ) : null}
          {collapsed && prNotes.length ? <Text numberOfLines={2} style={[styles.prNotes, { color: palette.success }]}>{prNotes.join(' · ')}</Text> : null}
          {collapsed || hasComparison || !compare ? null : <Label>{previousText ? t('logger.lastTime', { value: previousText }) : firstTimeLabel ?? t('logger.firstTime')}</Label>}
          {exercise.notes ? <Text numberOfLines={3} style={[styles.exerciseNote, { color: palette.textMuted }]}>{exercise.notes}</Text> : null}
        </Pressable>
        {/* The collapse chevron sits with the buttons, so all three share one row and one centre line. */}
        <IconButton icon={collapsed ? 'chevron-down' : 'chevron-up'} label={t(collapsed ? 'logger.expand' : 'logger.collapse', { name: exercise.name })} tone="plain" onPress={onToggleCollapsed} />
        {exercise.demoUrl ? (
          <IconButton icon="play-circle-outline" label={t('logger.referenceOpen')} tone="plain" onPress={() => openReferenceVideo(exercise.demoUrl!)} />
        ) : null}
        <IconButton icon="ellipsis-vertical" label={t('logger.options')} tone="plain" onPress={onOptions} />
      </View>
      </Pressable>
      {goal ? (
        <View style={[styles.goalCard, { backgroundColor: goal.reached ? palette.successSoft : palette.surface, borderColor: goal.reached ? palette.success : palette.border }]}>
          <View style={styles.goalRow}>
            {goal.reached ? <Icon name="checkmark-circle" size={20} color={palette.success} /> : null}
            <Text style={[styles.goalDone, { color: palette.text }]}>{goalAmount(goal.done)}</Text>
            <Text style={[styles.goalTarget, { color: palette.textMuted }]}>{`/ ${goalAmount(goal.target)}${goalUnit}`}</Text>
            <View style={styles.flex} />
            <Text style={[styles.goalState, { color: goal.reached ? palette.success : palette.accentStrong }]}>
              {goal.reached ? (goal.over > 0 ? t('totalGoal.reachedOver', { over: goalAmount(goal.over) }) : t('totalGoal.reached')) : t('totalGoal.remaining', { value: goalAmount(goal.remaining) })}
            </Text>
          </View>
          <ProgressMeter value={goal.done} total={goal.target} label={`${goalAmount(goal.done)} / ${goalAmount(goal.target)}${goalUnit}`} tone={goal.reached ? 'success' : 'accent'} />
        </View>
      ) : null}

      {!collapsed && hasComparison && previous ? (
        <LastTimeStrip
          comparison={comparison}
          metric={exercise.metric}
          date={previous.workoutStartedAt.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })}
          detail={previousText ?? ''}
        />
      ) : null}

      {!collapsed && onCopyAllLast ? (
        // A quiet link, not a full-width button: it is used once per exercise at most.
        <Pressable accessibilityRole="button" hitSlop={ADD_SLOP} onPress={() => { tapFeedback(); onCopyAllLast(); }} style={({ pressed }) => [styles.copyLink, pressed && { opacity: 0.6 }]}>
          <Icon name="arrow-undo-outline" size={14} color={palette.accentStrong} />
          <Text style={[styles.addSetText, { color: palette.accentStrong }]}>{t('logger.copyAllPrevious')}</Text>
        </Pressable>
      ) : null}


      {!collapsed && table && exercise.sets.length > 1 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(allOpen ? 'logger.closeAllSets' : 'logger.openAllSets')}
          hitSlop={spacing.sm}
          onPress={() => { tapFeedback(); setAllOpen(!allOpen); }}
          style={({ pressed }) => [styles.openAll, pressed && { opacity: 0.6 }]}
        >
          <Icon name={allOpen ? 'contract-outline' : 'expand-outline'} size={16} color={palette.accentStrong} />
          <Text style={[styles.openAllText, { color: palette.accentStrong }]}>{t(allOpen ? 'logger.closeAllSets' : 'logger.openAllSets')}</Text>
        </Pressable>
      ) : null}
      <View style={table ? styles.tableBleed : undefined}>
      {focus && !textIsLarge && !collapsed && exercise.sets.length > 0 ? <LedgerHeader valueLabel={(timed ? t('ledger.secCol') : distance ? t('ledger.metresCol') : t('ledger.repsCol'))} withLoad={withLoad} /> : null}
      {(collapsed ? [] : exercise.sets).map((set) => {
        const done = Boolean(set.completedAt);
        // In a running EMOM a recorded round stays editable in place and keeps its check, so the round count holds.
        const emomLocked = done && Boolean(emomBadgeLabel);
        // Very large text: the set in hand opens as a one-column block, the others fold to one line.
        const open = (!largeText || set.id === focusedId) && !folded.has(set.id);
        const editing = largeText && open;
        // Done rows drop − and +: a running EMOM or a long workout would otherwise be a wall of buttons.
        const showSteps = !done || editDone || editing;
        const editableDone = editDone || typeDone || emomLocked || editing;
        const workingNumber = groupSets(exercise.sets.filter((item) => item.kind === 'working' && item.index <= set.index)).length;
        const sideLabel = set.side === 'left' ? t('logger.sideLeft') : set.side === 'right' ? t('logger.sideRight') : '';
        const holding = hold?.setId === set.id;
        const isOpen = openOf(set);
        // A held press anywhere on the set opens the same menu as its three dots.
        const openMenu = () => { tapFeedback(); onSetOptions(set); };
        const stored = timed ? set.durationSec ?? 0 : distance ? set.distanceM ?? 0 : set.reps ?? 0;
        const value = holding && hold ? holdDisplay(hold) : timed ? formatClock(stored) : distance ? formatNumber(stored) : String(stored);
        const loadText = set.addedLoadKg === 0 ? '0' : formatLoad(set.addedLoadKg).replace(' kg', '');
        // RPE for the set in hand and the done ones (all five whole values in one row); later sets wait.
        // Every value of the set is one tap away: its chip opens the picker (or, for bands and note, the set's sheet).
        // By default a done set keeps a picker open while it has no value or is the one just done; otherwise only its chip shows.
        const working = set.kind === 'working' && !emomBadgeLabel;
        const foldable = done && !editDone && set.id !== lastDoneId;
        const isFolded = (value: number | null) => done && value !== null && (editDone || foldable);
        const canRpe = showRpe && working;
        const canForm = working;
        const canRom = !!onRomRating && working;
        // One value at a time: by default the first one still to fill (RPE, then form once done, then ROM) on the set in hand or just done.
        const live = done || editing || set.id === nextSetId;
        // With large text RPE is asked before completing; a done set opens form next, so the set in hand does not slide away.
        // Ledger (focus): pickers open only from their chips, never by themselves.
        const fallback = focus ? null : canRpe && live && !isFolded(set.rpe) && (set.rpe === null || !done) && !(largeText && done) ? 'rpe'
          : canForm && done && !isFolded(set.formRating) && set.formRating === null ? 'form'
            : canRom && live && !isFolded(set.romRating) && set.romRating === null ? 'rom'
              : null;
        const active = chosen.has(set.id) ? chosen.get(set.id)! : fallback;
        const rpeRow = canRpe && active === 'rpe';
        const formRow = canForm && active === 'form';
        const romRow = canRom && active === 'rom';
        const noteRow = !!onNote && active === 'note';
        // The chip strip shows on done sets and the next one (every set in a finished workout); other sets show only what they carry.
        const strip = done || editDone || set.id === nextSetId || isOpen || editing;
        const title = `${set.kind === 'warmup' ? t('workout.blocks.warmup') : t('logger.setTitle', { number: workingNumber })}${set.side === 'left' ? ' · L' : set.side === 'right' ? ' · R' : ''}`;
        const valueDown = showSteps ? <StepButton flat={focus && !textIsLarge} large={textIsLarge || bigButtons} icon="remove" label={t('logger.stepDown', { field: fieldLabel, number: workingNumber, side: sideLabel }).trim()} onPress={(multiplier) => step(set, field, (distance ? -0.5 : timed ? -5 : -1) * multiplier)} /> : null;
        const valueUp = showSteps ? <StepButton flat={focus && !textIsLarge} large={textIsLarge || bigButtons} icon="add" label={t('logger.stepUp', { field: fieldLabel, number: workingNumber, side: sideLabel }).trim()} onPress={(multiplier) => step(set, field, (distance ? 0.5 : timed ? 5 : 1) * multiplier)} /> : null;
        const valueField = (done && !editableDone) || holding ? (
          <Text style={[styles.setValue, { color: holding ? palette.accentStrong : palette.text }]}>{value}</Text>
        ) : timed ? (
          <HoldDurationField compact flat={table || focus} value={stored} label={`${t('logger.holdCol')} · ${t('logger.editValue', { number: set.index })}`} onChange={(next) => onSetValue(set, 'durationSec', next)} />
        ) : (
          <NumberEdit
            value={stored}
            display={value}
            label={`${t('logger.editValue', { number: set.index })} ${sideLabel}`}
            integer={field === 'reps'}
            onCommit={(next) => onSetValue(set, field, field === 'reps' ? Math.round(next) : next)}
            onControl={(control) => { controls.current.set(`${set.id}:${field}`, control); }}
            onLongPress={openMenu}
            style={[styles.setValue, focus && styles.setValueLedger, { color: palette.text }]}
          />
        );
        const loadDown = showSteps ? <StepButton flat={focus && !textIsLarge} large={textIsLarge || bigButtons} icon="remove" label={t('logger.stepDown', { field: t('history.addedLoad'), number: workingNumber, side: sideLabel }).trim()} onPress={(multiplier) => step(set, 'addedLoadKg', -LOAD_STEP_KG * multiplier)} /> : null;
        const loadUp = showSteps ? <StepButton flat={focus && !textIsLarge} large={textIsLarge || bigButtons} icon="add" label={t('logger.stepUp', { field: t('history.addedLoad'), number: workingNumber, side: sideLabel }).trim()} onPress={(multiplier) => step(set, 'addedLoadKg', LOAD_STEP_KG * multiplier)} /> : null;
        const loadField = done && !editableDone ? (
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
        );
        const badge = (
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
        );
        const menu = (
          // The touch area grows only towards the screen edge, never over the done button beside it.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('logger.setOptions', { number: set.index })}
            hitSlop={{ top: 0, bottom: 0, left: 0, right: 12 }}
            onPress={() => { tapFeedback(); onSetOptions(set); }}
            style={({ pressed }) => [styles.menuButton, pressed && { opacity: 0.6 }]}
          >
            <Icon name="ellipsis-vertical" size={18} color={palette.textMuted} />
          </Pressable>
        );
        // Fold control: the chevron always sits at the right edge of the set's row, folded or open.
        const foldButton = (isUp: boolean, onPress: () => void, color: string = palette.textMuted) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${t(isUp ? 'logger.foldSet' : 'logger.unfoldSet')}`}
            hitSlop={{ top: 0, bottom: 0, left: 6, right: 12 }}
            onPress={() => { tapFeedback(); onPress(); }}
            style={({ pressed }) => [styles.menuButton, pressed && { opacity: 0.6 }]}
          >
            <Icon name={isUp ? 'chevron-up' : 'chevron-down'} size={22} color={color} />
          </Pressable>
        );
        // Title of the open set's strip, with its state under it; a tap folds the set.
        const titleTap = (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${t('logger.foldSet')}`}
            onPress={() => { tapFeedback(); toggleFold(set.id); }}
            hitSlop={spacing.sm}
            style={[styles.largeTitleTap, textIsLarge && styles.largeTitleFull]}
          >
            {/* Title and state stacked: side by side they overlapped on a phone-width card. */}
            <View style={styles.stripTitles}>
              <Text style={[styles.largeStripText, { color: done ? palette.successText : palette.surface }]}>{focus ? `${title} / ${t(set.kind === 'warmup' ? 'activeSet.warmup' : 'activeSet.working')}` : title}</Text>
              {focus && !textIsLarge ? <Text style={[styles.stripState, { color: done ? palette.successText : palette.surface }]}>{`● ${holding ? t('activeSet.hold') : done ? t('activeSet.logged') : t('activeSet.inProgress')}`.toUpperCase()}</Text> : null}
            </View>
          </Pressable>
        );
        const summary = [title, timed ? value : distance ? `${value} m` : `${value} ${t('history.units.reps')}`, withLoad ? `${loadText} kg` : null, done && set.rpe !== null ? t('logger.rpeTag', { value: formatRpe(set.rpe) }) : null].filter(Boolean).join(' · ');
        const actionCol = (
      <View style={[styles.colAction, { width: checkBtn }]}>
        {done ? (
          <Animated.View entering={checkEntering}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('workout.setCompleted')} ${sideLabel}`}
              accessibilityState={{ checked: true, disabled: emomLocked }}
              accessibilityHint={emomLocked ? t('emom.editHint') : undefined}
              disabled={emomLocked}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 0 }}
              onPress={() => uncomplete(set)}
              onLongPress={openMenu}
              delayLongPress={450}
              style={({ pressed }) => [styles.checkButton, checkBox, { backgroundColor: palette.success }, pressed && styles.checkPressed]}
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
            onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') complete(set); }}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 0 }}
            onPress={() => holding ? onFinishHold?.() : onStartHold(set)}
            onLongPress={holding ? undefined : () => { tapFeedback(); complete(set); }}
            delayLongPress={400}
            style={({ pressed }) => [styles.checkButton, checkBox, holding || set.id === nextSetId ? { backgroundColor: palette.accent } : { backgroundColor: palette.surfaceMuted }, pressed && styles.checkPressed]}
          >
            <Icon name={holding ? 'stop' : 'play'} size={18} color={holding || set.id === nextSetId ? palette.accentText : palette.text} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('workout.completeSet')} ${sideLabel}`}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 0 }}
            onPress={() => complete(set)}
            onLongPress={openMenu}
            delayLongPress={450}
            style={({ pressed }) => [styles.checkButton, checkBox, set.id === nextSetId ? { backgroundColor: palette.accent } : { backgroundColor: palette.surfaceMuted, borderColor: palette.border, borderWidth: 1 }, pressed && styles.checkPressed]}
          >
            <Icon name="checkmark" size={20} color={set.id === nextSetId ? palette.accentText : palette.textMuted} />
          </Pressable>
        )}
      </View>
        );
        const compact = [timed ? value : distance ? `${value} m` : `${value} ${t('history.units.reps')}`, withLoad ? `${loadText} kg` : null, set.rpe !== null ? t('logger.rpeTag', { value: formatRpe(set.rpe) }) : null, set.formRating !== null ? `${t('lastTime.form')} ${formatNumber(set.formRating)}` : done && canForm ? `${t('lastTime.form')}?` : null].filter(Boolean).join(' · ');
        // Large text: a folded set is always one quiet row, like the compact list; ratings are given from the open set.
        const quiet = largeText && !editing;
        const rowBody = (
          <>
            {!largeText ? (
            /* Row 1: set, reps (or time, or distance), load, done, menu. */
            <Pressable accessible={false} accessibilityRole="none" onLongPress={openMenu} onPress={table ? () => { tapFeedback(); setExpanded((current) => new Map(current).set(set.id, false)); } : undefined} delayLongPress={450} style={[styles.setRow, table && styles.tableSetRow]}>
              {checkLeft ? actionCol : null}
              {table && !isOpen ? null : <View style={table ? styles.tableBadgeCol : styles.colSet}>{badge}</View>}
              <View style={[styles.colValue, styles.stepper, table && [styles.tile, { backgroundColor: palette.surface }]]}>
                {valueDown}
                <View style={styles.valueStack}>
                  {valueField}
                  {set.id === exercise.sets[0]?.id && !table ? <Text style={[styles.valueCaption, { color: palette.textMuted }]}>{fieldLabel.toLowerCase()}</Text> : null}
                </View>
                {valueUp}
              </View>
              {!withLoad ? null : set.addedLoadKg !== 0 || loadShown.has(set.id) ? (
                <View style={[styles.colLoad, styles.stepper, table && [styles.tile, { backgroundColor: palette.surface }]]}>{loadDown}{loadField}{loadUp}</View>
              ) : done ? <View style={styles.colLoad} /> : (
                <View style={[styles.colLoad, styles.stepper]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('logger.addLoad')}
                    onPress={() => { tapFeedback(); setLoadShown((shown) => new Set(shown).add(set.id)); }}
                    style={({ pressed }) => [styles.addLoad, { borderColor: palette.border, opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Text style={[styles.addLoadText, { color: palette.textMuted }]}>+ kg</Text>
                  </Pressable>
                </View>
              )}
              {checkLeft ? null : actionCol}
              <View style={styles.colMenu}>{table ? foldButton(true, () => setExpanded((current) => new Map(current).set(set.id, false))) : menu}</View>
            </Pressable>
            ) : open ? (
            /* Large text, the set in hand: title, then each field on its own line with big − and +. */
            <Pressable accessible={false} accessibilityRole="none" onLongPress={openMenu} delayLongPress={450} style={styles.largeFields}>
              {/* The open set reads as a sheet: an ink strip names it and folds it, the fields below. */}
              <View style={[styles.largeStrip, textIsLarge && styles.largeStripWrap, { backgroundColor: done ? palette.success : ink }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={set.kind === 'warmup' ? t('logger.warmupOn') : t('logger.warmupOff', { number: workingNumber })}
                  accessibilityHint={t('logger.warmupHint')}
                  hitSlop={8}
                  onPress={() => { tapFeedback(); onToggleWarmup(set); }}
                  onLongPress={openMenu}
                  delayLongPress={450}
                  style={[styles.stripBadge, { backgroundColor: palette.surfaceMuted }, set.kind === 'warmup' && { borderWidth: 1, borderStyle: 'dashed', borderColor: palette.textMuted }]}
                >
                  <Text style={[styles.setBadgeText, { color: set.kind === 'warmup' ? palette.textMuted : palette.text }]}>{set.kind === 'warmup' ? 'W' : workingNumber}</Text>
                </Pressable>
                {textIsLarge ? <View style={styles.flex} /> : titleTap}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('logger.setOptions', { number: set.index })}
                  onPress={() => { tapFeedback(); onSetOptions(set); }}
                  style={({ pressed }) => [styles.menuButton, pressed && { opacity: 0.6 }]}
                >
                  <Icon name="ellipsis-vertical" size={18} color={done ? palette.successText : palette.surface} />
                </Pressable>
                {foldButton(true, () => toggleFold(set.id), done ? palette.successText : palette.surface)}
                {/* Large text: the title takes a line of its own under the badge and buttons, so no word breaks. */}
                {textIsLarge ? titleTap : null}
              </View>
              {focus ? (() => {
                const match = previousMatchFor(set);
                const previousValue = match ? describePreviousSet(match, exercise.metric) : t('activeSet.firstTime');
                const reference = ghostFor(set);
                const unitWord = timed ? 's' : distance ? 'm' : t('history.units.reps');
                const max = gaugeMax(stored, reference);
                return (
                  <>
                    {textIsLarge ? <Tag color={palette.accentStrong}>{`● ${holding ? t('activeSet.hold') : done ? t('activeSet.logged') : t('activeSet.inProgress')}`.toUpperCase()}</Tag> : null}
                    <PreviousSetBox label={t('activeSet.previousLabel')} value={previousValue} rpeLabel={t('lastTime.rpeChip')} rpeValue={match && match.rpe !== null ? formatRpe(match.rpe) : null} sideLabel={t('activeSet.lastSession')} />
                    <View style={styles.measureRow}>
                      <MeasureBox stack={textIsLarge} label={fieldLabel.toUpperCase()}>
                        <View style={styles.largeStepper}>{valueDown}<View style={styles.largeValue}>{valueField}</View>{valueUp}</View>
                      </MeasureBox>
                      {withLoad ? (
                        <MeasureBox stack={textIsLarge} label={t('logger.loadCol').toUpperCase()}>
                          <View style={styles.largeStepper}>{loadDown}<View style={styles.largeValue}>{loadField}</View>{loadUp}</View>
                        </MeasureBox>
                      ) : null}
                    </View>
                    <WorkOutput
                      title={t('activeSet.workOutput').toUpperCase()}
                      current={`${formatNumber(stored)} ${unitWord}`}
                      reference={reference === null ? null : `${formatNumber(reference)} ${unitWord}`}
                      referenceLabel={t('activeSet.ref').toUpperCase()}
                      value={stored}
                      ghost={reference}
                      scale={t('activeSet.scaleOf', { value: `${formatNumber(max)} ${unitWord}` }).toUpperCase()}
                      color={done ? palette.success : palette.accentStrong}
                    />
                  </>
                );
              })() : (
                <>
                  <View style={styles.largeField}>
                    <Label>{fieldLabel}</Label>
                    <View style={styles.largeStepper}>{valueDown}<View style={styles.largeValue}>{valueField}</View>{valueUp}</View>
                  </View>
                  {withLoad ? (
                    <View style={styles.largeField}>
                      <Label>{t('logger.loadCol')}</Label>
                      <View style={styles.largeStepper}>{loadDown}<View style={styles.largeValue}>{loadField}</View>{loadUp}</View>
                    </View>
                  ) : null}
                </>
              )}
            </Pressable>
            ) : (
            /* Large text, any other set: one line; a tap opens it. */
            <View style={[styles.summaryLine, { borderBottomColor: palette.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${summary}${done ? `, ${t('history.setCompleted')}` : ''}`}
              accessibilityHint={t('logger.openSetHint')}
              onPress={() => { unfold(set.id); setPicked({ id: set.id, done }); }}
              onLongPress={openMenu}
              delayLongPress={450}
              style={styles.summaryRow}
            >
              <Text style={[styles.summaryNum, { color: palette.textMuted }]}>{`${set.kind === 'warmup' ? 'W' : String(workingNumber).padStart(2, '0')}${set.side === 'left' ? 'L' : set.side === 'right' ? 'R' : ''}`}</Text>
              <Text style={[styles.summaryText, { color: palette.textMuted }]}>{compact}</Text>
              {done
                ? <View style={[styles.summaryBox, { backgroundColor: palette.success }]}><Icon name="checkmark" size={16} color={palette.successText} /></View>
                : <View style={[styles.summaryBox, { borderColor: palette.textMuted, borderWidth: 1.5 }]} />}
            </Pressable>
            {foldButton(false, () => { unfold(set.id); setPicked({ id: set.id, done }); })}
            </View>
            )}
          </>
        );
        const current = holding || set.id === nextSetId;
        const rowUnit = timed ? '' : distance ? ' m' : ` ${t('history.units.reps')}`;
        const rowSummary = done ? [
          set.rpe !== null ? `RPE ${formatRpe(set.rpe)}` : null,
          set.formRating !== null ? `F ${formatNumber(set.formRating)}` : null,
          set.romRating !== null ? `ROM ${formatNumber(set.romRating)}` : null,
        ].filter(Boolean).join(' · ') : '';
        const stateColor = done ? palette.success : current ? palette.accentStrong : palette.textMuted;
        const tableCheck = (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={done ? t('workout.setCompleted') : t('workout.completeSet')}
            accessibilityState={{ checked: done }}
            hitSlop={spacing.xs}
            onPress={() => {
              tapFeedback();
              if (done) uncomplete(set);
              else if (timed && onStartHold) openOnly(set.id);
              else complete(set);
            }}
            style={[styles.tableCheck, tableCheckBox, { borderColor: done ? palette.success : current ? palette.accentStrong : ink, borderWidth: current && !done ? 3 : 1.5 }, done && { backgroundColor: palette.success }]}
          >
            {done ? <Icon name="checkmark" size={22} color={palette.successText} /> : null}
          </Pressable>
        );
        const tableRow = (
          <View style={[styles.tableRow, { backgroundColor: current ? palette.accentSoft : palette.surface }]}>
            {checkLeft ? tableCheck : null}
            {/* The set number switches the set between working and warm-up; the rest of the row opens it. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={set.kind === 'warmup' ? t('logger.warmupOn') : t('logger.warmupOff', { number: workingNumber })}
              accessibilityHint={t('logger.warmupHint')}
              hitSlop={spacing.sm}
              onPress={() => { tapFeedback(); onToggleWarmup(set); }}
              onLongPress={openMenu}
              delayLongPress={450}
              style={styles.tableBadgeCol}
            >
              <Text style={[styles.tableNumber, { color: stateColor }, set.kind === 'warmup' && styles.tableNumberWarmup]}>
                {`${set.kind === 'warmup' ? 'W' : workingNumber}${set.side === 'left' ? 'L' : set.side === 'right' ? 'R' : ''}`}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${summary}${done ? `, ${t('history.setCompleted')}` : ''}`}
              accessibilityState={{ expanded: isOpen }}
              accessibilityHint={t('logger.openSetHint')}
              onPress={() => { tapFeedback(); if (isOpen) setExpanded((currentOpen) => new Map(currentOpen).set(set.id, false)); else openOnly(set.id); }}
              onLongPress={openMenu}
              delayLongPress={450}
              style={({ pressed }) => [styles.tableRowMain, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.tableFigures}>
                <Text numberOfLines={1} style={[styles.tableValue, { color: done || current ? palette.text : palette.textMuted }]}>
                  {value}
                  <Text style={[styles.tableUnit, { color: palette.textMuted }]}>{`${rowUnit}${withLoad && set.addedLoadKg !== 0 ? ` · ${loadText} kg` : ''}`}</Text>
                </Text>
                <View style={styles.tableNotes}>
                  {setRecords.has(set.id) ? <Icon name="trophy" size={14} color={palette.record} /> : null}
                  {set.note ? <Icon name="chatbubble-ellipses-outline" size={14} color={palette.textMuted} /> : null}
                  {set.clipCount > 0 ? <Icon name="videocam" size={14} color={palette.accentStrong} /> : null}
                  {rowSummary ? <Text numberOfLines={1} style={[styles.tableSummary, { color: palette.textMuted }]}>{rowSummary}</Text> : null}
                </View>
              </View>
              <Gauge value={stored} ghost={ghostFor(set)} color={stateColor} delay={Math.min(set.index, 6) * 60} />
            </Pressable>
            {checkLeft ? null : tableCheck}
            {foldButton(false, () => openOnly(set.id))}
          </View>
        );
        // A planned set of a running EMOM is one quiet line: the clock fills it in, so steppers, check and ratings would only crowd the rounds.
        if (emomBadgeLabel && !done) {
          return (
            <Pressable key={`${set.id}-u`} accessibilityRole="button" accessibilityLabel={`${summary}, ${t('logger.setOptions', { number: set.index })}`} onPress={openMenu} style={({ pressed }) => [styles.upcomingRow, pressed && { opacity: 0.6 }]}>
              <Text style={[styles.upcomingText, { color: palette.textMuted }]}>{summary}</Text>
            </Pressable>
          );
        }
        const valuePanelNode = !quiet && (!table || isOpen) && (rpeRow || formRow || romRow || noteRow) ? (
              <View style={[styles.valuePanel, editing && styles.valuePanelLarge, table && styles.tablePanel, { backgroundColor: editing ? undefined : done ? palette.background : palette.surface }]}>
                {rpeRow ? <RpePicker compact grid={largeText} wrap sideLabel={sideLabel} value={set.rpe} target={set.targetRpe} onChange={(rpe) => onRpe(set, rpe)} /> : null}
                {formRow ? <FormRating value={set.formRating} sideLabel={sideLabel} onChange={(rating) => onFormRating(set, rating)} /> : null}
                {noteRow ? <NoteInput value={set.note ?? ''} label={t('logger.noteLabel')} placeholder={t('logger.notePlaceholder')} onSave={(note) => onNote!(set, note)} /> : null}
                {romRow ? <FormRating rom value={set.romRating} sideLabel={sideLabel} onChange={(rating) => onRomRating!(set, rating)} /> : null}
              </View>
            ) : null;
        // Ongoing workout (focus): every set is one ledger row; the set in hand edits in place with its chips.
        if (focus) {
          const side = set.side === 'left' ? 'L' as const : set.side === 'right' ? 'R' as const : null;
          const label = set.kind === 'warmup' ? 'W' : String(workingNumber);
          const described = set.bands.length > 0 ? describeBands?.(set) ?? null : null;
          const assist = set.bands.length === 0 ? null : set.assistKg === null ? null : formatNumber(set.assistKg);
          const bands = described ? { colors: described.colors, assist } : null;
          const openSet = () => { tapFeedback(); unfold(set.id); setPicked({ id: set.id, done }); };
          // A folded set in hand shows as a plain row; tapping it opens it again (unfold).
          const inHand = set.id === focusedId && (!done || picked?.id === set.id) && !folded.has(set.id);
          // Every ledger row swipes: right completes (or reopens a done set), left removes it.
          const swipe = (node: ReactNode, mode: string) => (
            <SwipeableSetRow
              key={`${set.id}-${mode}`}
              done={done}
              completeLabel={t('logger.swipeComplete')}
              reopenLabel={t('logger.swipeReopen')}
              removeLabel={t('logger.swipeRemove')}
              onSwipeRight={() => { onSwiped?.(); if (done) uncomplete(set); else complete(set); }}
              onSwipeLeft={() => { onSwiped?.(); onRemoveSet(set); }}
            >
              {node}
            </SwipeableSetRow>
          );
          if (!inHand) {
            const row = { label, side, warmup: set.kind === 'warmup', value: timed ? value : distance ? `${value} m` : value, load: withLoad ? loadText : null, bands, withLoad, onOpen: openSet, onMenu: openMenu };
            return done
              ? swipe(<LedgerDoneRow {...row} rpe={set.rpe !== null ? formatRpe(set.rpe) : null} />, 'ld')
              : swipe(<LedgerUpcomingRow {...row} next={set.id === nextSetId} />, 'lu');
          }
          const restSec = set.restSec ?? defaultRest;
          const completeSlot = done ? (
            <Pressable accessibilityRole="button" accessibilityState={{ checked: true }} accessibilityLabel={t('workout.setCompleted')} accessibilityHint={t('logger.swipeReopen')} hitSlop={6} onPress={() => uncomplete(set)} onLongPress={openMenu} delayLongPress={450} style={({ pressed }) => [styles.ledgerCheck, { backgroundColor: palette.success }, pressed && styles.checkPressed]}>
              <Icon name="checkmark" size={22} color={palette.successText} />
            </Pressable>
          ) : timed && onStartHold ? (
            <Pressable accessibilityRole="button" accessibilityLabel={holding ? t('logger.doneHold') : t('logger.startHold')} accessibilityHint={holding ? undefined : t('logger.holdLongPressHint')} onPress={() => (holding ? onFinishHold?.() : onStartHold(set))} onLongPress={holding ? undefined : () => { tapFeedback(); complete(set); }} delayLongPress={400} hitSlop={6} style={({ pressed }) => [styles.ledgerCheck, { backgroundColor: palette.accent }, pressed && styles.checkPressed]}>
              <Icon name={holding ? 'stop' : 'play'} size={22} color={palette.accentText} />
            </Pressable>
          ) : undefined;
          return swipe(
            <LedgerActiveRow
              label={label}
              side={side}
              warmup={set.kind === 'warmup'}
              withLoad={withLoad}
              onFold={() => toggleFold(set.id)}
              onMenu={openMenu}
              valueField={valueField}
              valueDown={valueDown}
              valueUp={valueUp}
              loadField={loadField}
              loadDown={loadDown}
              loadUp={loadUp}
              onComplete={() => complete(set)}
              completeSlot={completeSlot}
              rpe={canRpe ? { value: set.rpe !== null ? formatRpe(set.rpe) : null, target: set.targetRpe !== null ? formatRpe(set.targetRpe) : null, open: rpeRow, onPress: () => toggleOpen(set.id, 'rpe', rpeRow) } : null}
              form={canForm ? { value: set.formRating !== null ? formatNumber(set.formRating) : null, open: formRow, onPress: () => toggleOpen(set.id, 'form', formRow) } : null}
              rom={canRom ? { value: set.romRating !== null ? formatNumber(set.romRating) : null, open: romRow, onPress: () => toggleOpen(set.id, 'rom', romRow) } : null}
              bands={{ colors: described?.colors ?? [], assist, onPress: () => { tapFeedback(); onSetOptions(set, 'bands'); } }}
              rest={restSec > 0 ? { value: formatClock(restSec), filled: set.restSec !== null, onPress: () => { tapFeedback(); onSetOptions(set, 'rest'); } } : null}
              note={{ text: set.note || null, open: noteRow, onPress: () => { if (onNote) toggleOpen(set.id, 'note', noteRow); else { tapFeedback(); onSetOptions(set, 'note'); } } }}
              video={{ clips: set.clipCount, onPress: () => { tapFeedback(); if (set.clipCount > 0) onSetOptions(set); else router.push({ pathname: '/form-check/[setId]', params: { setId: set.id } }); } }}
              panel={valuePanelNode}
              tone={done ? 'edit' : 'next'}
              bandsInUse={bandsInUse}
            />,
            done ? 'lad' : 'la',
          );
        }
        return (
          <Animated.View key={`${set.id}${largeText ? (editing ? "-e" : "-f") : table ? (isOpen ? "-o" : "-r") : ""}`} entering={largeText || table ? undefined : setEntering} style={[styles.setBlock, largeText && !editing && styles.setBlockLine, editing && [styles.largeBlock, { borderColor: done ? palette.success : palette.border, backgroundColor: done ? palette.successSoft : palette.background }], table && [styles.tableBlock, { borderTopColor: palette.border }, isOpen && { backgroundColor: palette.background, borderTopColor: ink, borderBottomWidth: 1, borderBottomColor: ink, borderLeftWidth: 4, borderLeftColor: palette.accentStrong }]]}>
            {editing || table || largeText ? null : <DoneTint done={done} color={palette.accentSoft} />}
            {/* The set in hand with very large text is not swiped: its steppers and buttons own the gestures. */}
            {editing ? rowBody : (
            <SwipeableSetRow
              done={done}
              onPage
              completeLabel={t('logger.swipeComplete')}
              reopenLabel={t('logger.swipeReopen')}
              removeLabel={t('logger.swipeRemove')}
              onSwipeRight={() => { onSwiped?.(); if (done) uncomplete(set); else complete(set); }}
              onSwipeLeft={() => { onSwiped?.(); onRemoveSet(set); }}
            >
              {table && !isOpen ? tableRow : (
                <>
                  {rowBody}
                  {table ? <View style={styles.openGauge}><Gauge value={stored} ghost={ghostFor(set)} color={stateColor} /></View> : null}
                </>
              )}
            </SwipeableSetRow>
            )}
            {/* Row 2: how hard it was. */}
            {/* Row 3, once the set is done: how clean the form was. The exercise folds only after the last rating. */}
            {/* Only when there is something to show: PR, clips, note (and RPE when its row is hidden). */}
            {focus && editing ? (() => {
              const cells: RatingCell[] = [];
              if (canRpe) cells.push({ id: 'rpe', label: t('lastTime.rpeChip').toUpperCase(), value: set.rpe !== null ? formatRpe(set.rpe) : null, hint: set.targetRpe !== null ? t('activeSet.target', { value: formatRpe(set.targetRpe) }).toUpperCase() : undefined, open: rpeRow, onPress: () => toggleOpen(set.id, 'rpe', rpeRow) });
              if (canForm) cells.push({ id: 'form', label: t('lastTime.form').toUpperCase(), value: set.formRating !== null ? formatNumber(set.formRating) : null, hint: t('activeSet.scale', { range: '1–5' }).toUpperCase(), open: formRow, onPress: () => toggleOpen(set.id, 'form', formRow) });
              if (canRom) cells.push({ id: 'rom', label: t('lastTime.rom').toUpperCase(), value: set.romRating !== null ? formatNumber(set.romRating) : null, hint: t('activeSet.scale', { range: '1–5' }).toUpperCase(), open: romRow, onPress: () => toggleOpen(set.id, 'rom', romRow) });
              const described = set.bands.length > 0 ? describeBands?.(set) : null;
              const bandsOpen = bandsEditing === set.id;
              const recorded = [set.rpe, set.formRating, set.romRating].filter((value) => value !== null).length;
              const detailsShown = detailsOpen.has(set.id);
              const detailCount = [set.restSec !== null, set.side === 'left' || set.side === 'right', Boolean(set.note), set.clipCount > 0].filter(Boolean).length;
              const unknownKg = set.bands.length > 0 && set.assistKg === null;
              return (
                <>
                  {bandsInUse ? (
                    <>
                      <BandsStrip
                        title={t('activeSet.bandsTitle').toUpperCase()}
                        tag={t('activeSet.activeInput').toUpperCase()}
                        assistLabel={t('activeSet.estimatedAssist').toUpperCase()}
                        assistValue={set.bands.length === 0 ? '—' : unknownKg ? '?' : `−${formatNumber(set.assistKg ?? 0)}`}
                        assistUnit={set.bands.length === 0 || unknownKg ? null : 'KG'}
                        assistFoot={(unknownKg ? t('activeSet.assistFootUnknown') : t('activeSet.assistFoot')).toUpperCase()}
                        text={described?.text ?? t('bands.chipEmpty')}
                        colors={described?.colors ?? []}
                        open={bandsOpen}
                        folded={bandsFolded}
                        foldLabel={t(bandsFolded ? 'activeSet.bandsUnfold' : 'activeSet.bandsFold')}
                        onToggleFolded={toggleBandsFolded}
                        actionLabel={t(bandsOpen ? 'activeSet.bandsClose' : 'activeSet.bandsEdit').toUpperCase()}
                        onPress={() => { tapFeedback(); setBandsEditing(bandsOpen ? null : set.id); }}
                      />
                      {bandsOpen ? renderBandsEditor?.(set) ?? null : null}
                    </>
                  ) : null}
                  {cells.length > 0 ? (
                    <RatingCells
                      title={t('activeSet.setTelemetry').toUpperCase()}
                      counter={t('activeSet.recorded', { done: recorded, total: cells.length }).toUpperCase()}
                      cells={cells}
                      open={telemetryOpen.has(set.id)}
                      onToggle={() => { tapFeedback(); setTelemetryOpen((current) => { const next = new Set(current); if (!next.delete(set.id)) next.add(set.id); return next; }); }}
                    />
                  ) : null}
                  {cells.length === 0 || telemetryOpen.has(set.id) ? valuePanelNode : null}
                  <DetailsToggle
                    label={t('activeSet.additional').toUpperCase()}
                    count={`${detailCount}/4`}
                    open={detailsShown}
                    actionLabel={t(detailsShown ? 'activeSet.closeWord' : 'activeSet.openWord').toUpperCase()}
                    onPress={() => { tapFeedback(); setDetailsOpen((current) => { const next = new Set(current); if (next.has(set.id)) next.delete(set.id); else next.add(set.id); return next; }); }}
                  />
                </>
              );
            })() : null}
            {!quiet && (!table || isOpen) && !(focus && editing && !detailsOpen.has(set.id)) && (strip || set.note || set.clipCount > 0 || (set.poseCount ?? 0) > 0 || set.rpe !== null || setRecords.has(set.id) || set.bands.length > 0) ? (() => {
              // The chips fold behind one quiet line, folded by default; the open set of the ledger has its own "Additional" fold.
              const folds = !(focus && editing);
              const chipsShown = !folds || chipsOpen.has(set.id);
              const described = set.bands.length > 0 ? describeBands?.(set) : null;
              const summary = [
                canRpe && set.rpe !== null ? t('logger.rpeTag', { value: formatRpe(set.rpe) }) : null,
                canForm && set.formRating !== null ? `${t('lastTime.form')} ${formatNumber(set.formRating)}` : null,
                canRom && set.romRating !== null ? `${t('lastTime.rom')} ${formatNumber(set.romRating)}` : null,
                described ? described.text : null,
                set.restSec !== null && set.restSec > 0 ? t('logger.restChip', { value: formatClock(set.restSec) }) : null,
                set.note ? t('logger.noteChip') : null,
                set.clipCount > 0 ? t('logger.clip', { count: set.clipCount }) : null,
              ].filter(Boolean).join(' · ');
              return (
              <>
              {folds ? (
                <ChipsFold
                  label={t('logger.chipsFold').toUpperCase()}
                  summary={summary}
                  record={setRecords.has(set.id)}
                  open={chipsShown}
                  onPress={() => { tapFeedback(); setChipsOpen((current) => { const next = new Set(current); if (!next.delete(set.id)) next.add(set.id); return next; }); }}
                  trailing={table && isOpen ? menu : null}
                  style={[styles.chipsFold, editing && styles.chipsFoldLarge, table && styles.chipsFoldTable]}
                />
              ) : null}
              {chipsShown ? (
              <View style={[styles.setMeta, editing && styles.setMetaLarge, table && styles.tableChips, folds && table && styles.tableChipsFolded]}>
                {canRpe && !(focus && editing) && (strip || set.rpe !== null) ? (
                  <ValueChip flat={table} label={set.rpe !== null ? t('logger.rpeTag', { value: formatRpe(set.rpe) }) : t('lastTime.rpeChip')} icon="speedometer-outline" filled={set.rpe !== null} open={rpeRow} onPress={() => toggleOpen(set.id, 'rpe', rpeRow)} />
                ) : null}
                {canForm && !(focus && editing) && (strip || set.formRating !== null) ? (
                  <ValueChip flat={table} label={set.formRating !== null ? `${t('lastTime.form')} ${formatNumber(set.formRating)}` : t('lastTime.form')} filled={set.formRating !== null} open={formRow} onPress={() => toggleOpen(set.id, 'form', formRow)} />
                ) : null}
                {canRom && !(focus && editing) && (strip || set.romRating !== null) ? (
                  <ValueChip flat={table} label={set.romRating !== null ? `${t('lastTime.rom')} ${formatNumber(set.romRating)}` : t('lastTime.rom')} filled={set.romRating !== null} open={romRow} onPress={() => toggleOpen(set.id, 'rom', romRow)} />
                ) : null}
                {(() => {
                  const described = set.bands.length > 0 ? describeBands?.(set) : null;
                  return strip || described ? (
                    <ValueChip
                      flat={table}
                      label={described ? described.text : t('bands.chipEmpty')}
                      icon="git-commit-outline"
                      filled={Boolean(described)}
                      colors={described?.colors}
                      onPress={() => { tapFeedback(); onSetOptions(set, 'bands'); }}
                    />
                  ) : null;
                })()}
                {table || editing ? (
                  <>
                    {(set.restSec ?? defaultRest) > 0 ? <ValueChip flat label={t('logger.restChip', { value: formatClock(set.restSec ?? defaultRest) })} filled={set.restSec !== null} onPress={() => { tapFeedback(); onSetOptions(set, 'rest'); }} /> : null}
                    {set.side === 'left' || set.side === 'right' ? <ValueChip flat label={sideLabel} filled onPress={() => { tapFeedback(); onSetOptions(set); }} /> : null}
                    {set.clipCount === 0 ? <ValueChip flat label={t('logger.videoChip')} icon="videocam" filled={false} onPress={() => { tapFeedback(); router.push({ pathname: '/form-check/[setId]', params: { setId: set.id } }); }} /> : null}
                  </>
                ) : null}
                {strip || set.note ? (
                  <ValueChip flat={table} label={set.note ? set.note : t('logger.noteChip')} icon="chatbubble-ellipses-outline" filled={Boolean(set.note)} grow lines={3} onPress={() => { if (onNote) toggleOpen(set.id, 'note', noteRow); else { tapFeedback(); onSetOptions(set, 'note'); } }} open={noteRow} />
                ) : null}
                {setRecords.has(set.id) ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={setRecords.get(set.id)!.map((kind) => t(`records.kinds.${kind}`)).join(', ')}
                    hitSlop={8}
                    onPress={() => onSetOptions(set)}
                    style={[styles.clipChip, { backgroundColor: palette.recordSoft }]}
                  >
                    <Icon name="trophy" size={13} color={palette.record} />
                    <Text style={[styles.clipChipText, { color: palette.record }]}>{t('records.pr')}</Text>
                  </Pressable>
                ) : null}
                {set.clipCount > 0 ? (
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onSetOptions(set)} style={[styles.clipChip, { backgroundColor: palette.surface }]}>
                    <Icon name="videocam" size={13} color={palette.accentStrong} />
                    <Text style={[styles.clipChipText, { color: palette.accentStrong }]}>{t('logger.clip', { count: set.clipCount })}</Text>
                  </Pressable>
                ) : null}
                {table && isOpen && !folds ? menu : null}
                {(set.poseCount ?? 0) > 0 ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={t('poseLink.setActionCount', { count: set.poseCount })} hitSlop={8} onPress={() => onSetOptions(set)} style={[styles.clipChip, { backgroundColor: palette.surface }]}>
                    <Icon name="scan-outline" size={13} color={palette.accentStrong} />
                    <Text style={[styles.clipChipText, { color: palette.accentStrong }]}>{set.poseCount}</Text>
                  </Pressable>
                ) : null}
              </View>
              ) : null}
              </>
              );
            })() : null}
            {focus && editing ? null : valuePanelNode}
            {focus && editing && !done ? (() => {
              const following = exercise.sets.find((item) => !item.completedAt && item.id !== set.id && item.index > set.index);
              if (!following) return null;
              const number = groupSets(exercise.sets.filter((item) => item.kind === 'working' && item.index <= following.index)).length;
              const value = timed ? formatClock(following.durationSec ?? 0) : distance ? `${formatNumber(following.distanceM ?? 0)} m` : `${following.reps ?? 0} ${t('history.units.reps')}`;
              const restSec = set.restSec ?? defaultRest;
              return (
                <View style={styles.queue}>
                  <Text style={[styles.queueText, { color: palette.textMuted }]}>{t('activeSet.next', { number, value }).toUpperCase()}</Text>
                  {restSec > 0 ? <Text style={[styles.queueText, { color: palette.textMuted }]}>{t('activeSet.rest', { value: formatClock(restSec) }).toUpperCase()}</Text> : null}
                </View>
              );
            })() : null}
            {/* Large text: one wide button finishes the set (or runs its hold). */}
            {editing && !(fixedAction && !done && set.id === nextSetId) ? (
              <View style={[styles.actionRow, textIsLarge && styles.actionRowWrap]}>
              {done ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ checked: true, disabled: emomLocked }}
                  accessibilityHint={emomLocked ? t('emom.editHint') : t('logger.swipeReopen')}
                  disabled={emomLocked}
                  onPress={() => uncomplete(set)}
                  onLongPress={openMenu}
                  delayLongPress={450}
                  style={({ pressed }) => [styles.largeAction, { backgroundColor: palette.success }, pressed && styles.checkPressed]}
                >
                  <Icon name="checkmark" size={22} color={palette.successText} />
                  <Text style={[styles.largeActionText, { color: palette.successText }]}>{t('workout.setCompleted')}</Text>
                </Pressable>
              ) : timed && onStartHold ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint={holding ? undefined : t('logger.holdLongPressHint')}
                  accessibilityActions={holding ? undefined : [{ name: 'longpress', label: t('logger.markDoneNoTimer') }]}
                  onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') complete(set); }}
                  onPress={() => holding ? onFinishHold?.() : onStartHold(set)}
                  onLongPress={holding ? undefined : () => { tapFeedback(); complete(set); }}
                  delayLongPress={400}
                  style={({ pressed }) => [styles.largeAction, { backgroundColor: palette.accent }, pressed && styles.checkPressed]}
                >
                  <Icon name={holding ? 'stop' : 'play'} size={22} color={palette.accentText} />
                  <Text style={[styles.largeActionText, { color: palette.accentText }]}>{holding ? t('logger.doneHold') : `${t('logger.startHold')} ${formatClock(stored)}`}</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => complete(set)}
                  onLongPress={openMenu}
                  delayLongPress={450}
                  style={({ pressed }) => [styles.largeAction, { backgroundColor: palette.accent }, pressed && styles.checkPressed]}
                >
                  <Icon name="checkmark" size={22} color={palette.accentText} />
                  <Text style={[styles.largeActionText, { color: palette.accentText }]}>{focus ? t('activeSet.completeSet', { number: workingNumber }).toUpperCase() : t('workout.completeSet')}</Text>
                </Pressable>
              )}
              {focus && !done ? (
                // Beside Complete; at large text a full-width row under it, with its label.
                <Pressable accessibilityRole="button" accessibilityLabel={t('activeSet.moreDetails')} onPress={() => { tapFeedback(); onSetOptions(set); }} style={({ pressed }) => [styles.detailsButton, textIsLarge && styles.detailsButtonWide, { borderColor: ink, backgroundColor: palette.surface }, pressed && { opacity: 0.6 }]}>
                  <Icon name="options-outline" size={22} color={palette.accentStrong} />
                  {textIsLarge ? <Text style={[styles.largeActionText, { color: palette.accentStrong }]}>{t('activeSet.moreDetails')}</Text> : null}
                </Pressable>
              ) : null}
              </View>
            ) : null}
            {/* The fixed Complete button stands in for this one: its room stays, so selecting an exercise moves nothing. */}
            {editing && fixedAction && !done && set.id === nextSetId ? <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.fixedActionRoom} /> : null}
          </Animated.View>
        );
      })}
      </View>

      {/* One compact split button under the sets: "+ Add set", and a chevron that unfolds the other ways to add (warm-up) below it. */}
      {collapsed ? null : <View style={[styles.addRow, table && [styles.addRowTable, { borderTopColor: palette.border }]]}>
        <View style={styles.addSplit}>
          <Pressable
            accessibilityRole="button"
            hitSlop={ADD_SLOP}
            onPress={() => { tapFeedback(); setAddMenuOpen(false); onAddSet(); }}
            style={({ pressed }) => [styles.addSet, onAddWarmup ? styles.addSetJoined : null, { borderColor: ink, backgroundColor: palette.surface }, pressed && { backgroundColor: palette.accentSoft }]}
          >
            <Icon name="add" size={14} color={palette.accentStrong} />
            <Text style={[styles.addSetText, { color: palette.accentStrong }]}>{emomBadgeLabel ? t('emom.addRound') : t('logger.addSet')}</Text>
          </Pressable>
          {onAddWarmup ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('logger.addMore')}
              accessibilityState={{ expanded: addMenuOpen }}
              hitSlop={ADD_MORE_SLOP}
              onPress={() => { tapFeedback(); setAddMenuOpen(!addMenuOpen); }}
              style={({ pressed }) => [styles.addMore, { borderColor: ink, backgroundColor: addMenuOpen || pressed ? palette.accentSoft : palette.surface }]}
            >
              <Icon name={addMenuOpen ? 'chevron-up' : 'chevron-down'} size={14} color={palette.accentStrong} />
            </Pressable>
          ) : null}
        </View>
        {addMenuOpen && onAddWarmup ? (
          <View style={[styles.addMenu, { borderColor: ink, backgroundColor: palette.surface }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityHint={t('logger.warmupHint')}
              onPress={() => { tapFeedback(); setAddMenuOpen(false); onAddWarmup(); }}
              style={({ pressed }) => [styles.addMenuItem, pressed && { backgroundColor: palette.accentSoft }]}
            >
              <Icon name="flame-outline" size={16} color={palette.textMuted} />
              <Text style={[styles.addMenuText, { color: palette.text }]}>{t('logger.addWarmup')}</Text>
            </Pressable>
          </View>
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

/** One value of a set as a chip: filled with the value, or dashed when empty; a tap edits it. */
function ValueChip({ label, icon, filled, open = false, grow = false, lines = 1, colors, flat = false, onPress }: { flat?: boolean; lines?: number; label: string; icon?: Parameters<typeof Icon>[0]['name']; filled: boolean; open?: boolean; grow?: boolean; colors?: string[]; onPress: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const ink = useInk();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open }}
      hitSlop={6}
      onPress={onPress}
      style={[
        styles.valueChip,
        grow && styles.valueChipGrow,
        flat
          ? { backgroundColor: open ? ink : palette.surface, borderColor: ink, borderWidth: 1, borderRadius: instrument.radius }
          : filled ? { backgroundColor: palette.accentSoft, borderColor: open ? palette.accentStrong : 'transparent' } : { borderColor: open ? palette.accentStrong : palette.border, borderStyle: open ? 'solid' : 'dashed' },
      ]}
    >
      {colors?.map((color, index) => <View key={`${color}-${index}`} style={[styles.bandDot, { backgroundColor: color, borderColor: palette.border }]} />)}
      {icon && !colors?.length ? <Icon name={icon} size={14} color={flat ? (open ? palette.surface : palette.textMuted) : filled ? palette.accentStrong : palette.textMuted} /> : null}
      <Text numberOfLines={lines} style={[styles.valueChipText, { color: flat ? (open ? palette.surface : palette.text) : filled ? palette.accentStrong : palette.textMuted }, flat && styles.valueChipMono]}>{label}</Text>
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  bandDot: { width: 12, height: 12, borderRadius: radii.control, borderWidth: 1 },
  flex: { flex: 1 },
  // Exercises are flat sections divided by a hairline, not cards: more room for the sets.
  exerciseNow: { borderTopWidth: 2 },
  exerciseSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, gap: 8 },
  exerciseHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4, marginBottom: 4 },
  results: { fontFamily: fonts.semibold, fontSize: 15, marginTop: 2 },
  prNotes: { fontFamily: fonts.semibold, fontSize: 13 },
  // As tall as the 48 dp buttons beside it, so the chevron and the buttons share one centre line.
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: MIN_TOUCH_TARGET },
  progressRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 5 },
  exerciseName: { fontFamily: fonts.display, fontSize: 21, lineHeight: 25 },
  // Column labels only: the section's hairline above already separates it, a second line would be noise.
  columns: { flexDirection: 'row', alignItems: 'center', paddingLeft: 2 },
  colSet: { width: 40 },
  colValue: { flex: 1, textAlign: 'center' },
  colLoad: { flex: 1, textAlign: 'center' },
  colHeader: { textAlign: 'center' },
  colAction: { alignItems: 'center' },
  colMenu: { width: 36, alignItems: 'center' },
  menuButton: { width: 36, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  goalCard: { borderWidth: 1, borderRadius: radii.control, padding: 12, gap: 8, marginBottom: 8 },
  goalRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 },
  goalDone: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, fontVariant: ['tabular-nums'] },
  goalTarget: { fontFamily: fonts.medium, fontSize: 16 },
  goalState: { fontFamily: fonts.semibold, fontSize: 15 },
  setBlock: { borderRadius: radii.control, overflow: 'hidden', marginBottom: 8 },
  valueStack: { alignItems: 'center' },
  valueCaption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 14 },
  addLoad: { minWidth: 56, minHeight: 48, paddingHorizontal: 10, borderRadius: radii.control, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addLoadText: { fontFamily: fonts.semibold, fontSize: 15 },
  // Large text: the open set is a card of one-column fields; the other sets are one line each.
  // Focus card: one 16 rhythm between header, fields, chips, scale and button.
  largeBlock: { borderRadius: radii.control, borderWidth: 2, padding: 16, gap: 16, marginVertical: 8, marginHorizontal: -spacing.sm },
  largeStripWrap: { flexWrap: 'wrap', paddingBottom: spacing.sm },
  largeStrip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, marginHorizontal: -spacing.md, marginTop: -16, paddingHorizontal: spacing.md },
  stripTitles: { flex: 1, minWidth: 0 },
  largeStripText: { fontFamily: fonts.monoSemibold, fontSize: 13, lineHeight: 18, textTransform: 'uppercase', letterSpacing: 0.5 },
  largeFields: { gap: spacing.md },
  setBlockLine: { marginBottom: 0 },
  upcomingRow: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.md },
  upcomingText: { fontSize: 14 },
  largeHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  largeTitle: { flex: 1, fontFamily: fonts.display, fontSize: 22 },
  largeField: { gap: 8 },
  largeStepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  largeValue: { flex: 1, alignItems: 'center' },
  setOfRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md },
  setOfBar: { flexGrow: 1, flexBasis: 120 },
  measureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.sm },
  stripState: { fontSize: 12, letterSpacing: 0.5 },
  queue: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.xs, paddingVertical: spacing.sm },
  queueText: { fontSize: 12, letterSpacing: 0.5 },
  fixedActionRoom: { minHeight: 56 },
  ledgerCheck: { minWidth: 40, minHeight: 36, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  actionRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  actionRowWrap: { flexWrap: 'wrap' },
  detailsButtonWide: { flexBasis: '100%', flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  detailsButton: { minWidth: 56, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: radii.control },
  largeAction: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radii.control },
  largeActionText: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 17, textAlign: 'center' },
  summaryLine: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderStyle: 'dashed' },
  summaryRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 4, paddingLeft: 4 },
  summaryNum: { minWidth: 36, fontFamily: fonts.monoSemibold, fontSize: 14 },
  stripBadge: { minWidth: 40, minHeight: 40, paddingHorizontal: 6, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  summaryBox: { width: 28, height: 28, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  summaryText: { flex: 1, fontFamily: fonts.semibold, fontSize: 15 },
  // 12 at the sides (not 16): the ledger's fields need the width more than the card needs the margin.
  exerciseCard: { borderRadius: instrument.radius, borderWidth: instrument.line, paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.sm },
  halo: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderWidth: 3, borderRadius: instrument.radius + 3 },
  nowRow: { paddingHorizontal: spacing.xs },
  // Reaches the card's top and side edges (negative margins cancel the card padding) so the whole header block is a tap target.
  headerTap: { marginHorizontal: -spacing.md, marginTop: -spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.xs },
  headerTapFolded: { marginBottom: -spacing.lg, paddingBottom: spacing.lg },
  exerciseNameCard: { fontSize: 30, lineHeight: 32, textTransform: 'uppercase' },
  tableBleed: { marginHorizontal: -spacing.md },
  tableBadgeCol: { width: spacing.section * 2, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  tableNumber: { fontFamily: fonts.monoBold, fontSize: 16 },
  tableNumberWarmup: { textDecorationLine: 'underline', textDecorationStyle: 'dashed' },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  tableRowMain: { flex: 1, minWidth: 0, minHeight: MIN_TOUCH_TARGET + spacing.sm, justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  tableFigures: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: spacing.sm },
  tableValue: { fontFamily: fonts.monoBold, fontSize: 18, lineHeight: 24, fontVariant: ['tabular-nums'] },
  tableUnit: { fontFamily: fonts.mono, fontSize: 12 },
  tableNotes: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  tableSummary: { flexShrink: 1, fontFamily: fonts.mono, fontSize: 12 },
  tableCheck: { borderRadius: instrument.radius, alignItems: 'center', justifyContent: 'center' },
  openGauge: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  valueChipMono: { fontFamily: fonts.monoSemibold, fontSize: 12, textTransform: 'uppercase' },
  tableBlock: { borderRadius: 0, marginBottom: 0, borderTopWidth: 1 },
  addRowTable: { borderTopWidth: 1, marginHorizontal: -spacing.md, marginBottom: -spacing.lg, marginTop: 0, paddingHorizontal: spacing.md, justifyContent: 'center' },
  tableChips: { paddingLeft: spacing.lg, paddingRight: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  tableChipsFolded: { paddingTop: spacing.xs },
  chipsFold: { paddingLeft: 48, paddingRight: spacing.md }, // 48: under the values, after the set number
  chipsFoldLarge: { paddingLeft: 0, paddingRight: 0 },
  chipsFoldTable: { paddingLeft: spacing.lg, paddingRight: spacing.lg, paddingTop: spacing.xs },
  tablePanel: { marginLeft: spacing.lg, marginRight: spacing.lg },
  tableSetRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs },
  tile: { borderRadius: radii.control, paddingVertical: spacing.xs, marginHorizontal: spacing.sm },
  setRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingTop: 4, paddingLeft: 2 },
  recordChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: radii.control, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4 },
  setMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingLeft: 48, paddingRight: 12, paddingBottom: 8 }, // 48: under the values, after the set number
  clipChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 32, borderRadius: radii.pill },
  clipChipText: { fontFamily: fonts.semibold, fontSize: 12 },
  setMetaLarge: { paddingLeft: 0, paddingRight: 0, paddingBottom: 0 },
  valuePanelLarge: { marginLeft: 0, marginRight: 0, marginBottom: 0, padding: 0 },
  valuePanel: { marginLeft: 48, marginRight: 12, marginBottom: 12, borderRadius: radii.control, padding: 8 },
  valueChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radii.control, borderWidth: 1, maxWidth: '100%' },
  noteInput: { maxHeight: 220 },
  valueChipGrow: { flexShrink: 1 },
  valueChipText: { fontFamily: fonts.semibold, fontSize: 14, flexShrink: 1 },
  noteChip: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minHeight: 32 },
  setNote: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  exerciseNote: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, marginTop: 4 },
  setBadge: { width: 36, height: 36, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  setBadgeText: { fontFamily: fonts.display, fontSize: 16 },
  setBadgeSide: { fontFamily: fonts.semibold, fontSize: 10, lineHeight: 11, marginTop: -2 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  setValueLedger: { fontSize: 20, lineHeight: 26 },
  setValue: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, minWidth: 34, textAlign: 'center', fontVariant: ['tabular-nums'] },
  loadValue: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, minWidth: 34, textAlign: 'center', fontVariant: ['tabular-nums'] },
  openAll: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: MIN_TOUCH_TARGET - spacing.sm, paddingHorizontal: spacing.xs },
  openAllText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  largeTitleFull: { flexBasis: '100%' },
  largeTitleTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  checkButton: { borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  checkPressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },
  addRow: { alignItems: 'flex-start', gap: spacing.xs, paddingVertical: spacing.sm },
  copyLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.xs, minHeight: MIN_TOUCH_TARGET - 2 * spacing.sm },
  addSplit: { flexDirection: 'row', alignItems: 'stretch', maxWidth: '100%' },
  addSet: { flexDirection: 'row', flexShrink: 1, alignItems: 'center', gap: spacing.xs, minHeight: MIN_TOUCH_TARGET - 2 * spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderRadius: radii.control },
  addSetJoined: { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  addSetText: { fontFamily: fonts.monoSemibold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', flexShrink: 1 },
  addMore: { minWidth: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderLeftWidth: 0, borderTopRightRadius: radii.control, borderBottomRightRadius: radii.control },
  addMenu: { minWidth: 200, maxWidth: '100%', borderWidth: 1, borderRadius: radii.control, overflow: 'hidden' },
  addMenuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md },
  addMenuText: { fontFamily: fonts.body, fontSize: 15, flexShrink: 1 },
});

/** The set's note typed in place: the keyboard opens at once, and the text is saved on blur or when the field closes. */
function NoteInput({ value, label, placeholder, onSave }: { value: string; label: string; placeholder: string; onSave: (note: string) => void }) {
  const [text, setText] = useState(value);
  const latest = useRef({ text, value, onSave });
  useEffect(() => { latest.current = { text, value, onSave }; });
  useEffect(() => () => {
    const current = latest.current;
    if (current.text.trim() !== current.value.trim()) current.onSave(current.text);
  }, []);
  return (
    <TextField
      label={label}
      value={text}
      onChangeText={setText}
      onBlur={() => { if (text.trim() !== value.trim()) onSave(text); }}
      placeholder={placeholder}
      multiline
      autoFocus
      maxLength={500}
      style={baseStyles.noteInput}
    />
  );
}
