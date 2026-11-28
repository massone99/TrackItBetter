import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ActionButton, Body, Icon, Label, MenuList, MenuSwitchRow, Sheet, Stepper, Text, tapFeedback } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, radii, spacing } from '../../shared/theme/tokens';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { formatClock } from '../../shared/utils/format';
import { parseTimedCues, timedKindFor, timedRounds } from '../../domain/timedMethod';
import type { SessionExercise } from './repository';
import { DEFAULT_TIMED_CONFIG, readTimedConfig } from './timedMethodPlan';
import { TimedCuesEditor, toneLabelKey } from './TimedCuesEditor';
import type { TimedStart } from './useTimedMethod';

/** Exercises measured in time run holds; rep exercises run work intervals (with or without load). */
export const timedMethodFits = (metric: string) => metric === 'time' || metric === 'time_load' || metric === 'reps' || metric === 'reps_load';

export function TimedMethodSetupSheet({ exercise, onClose, onStart, onNarrate }: {
  exercise: SessionExercise | null;
  onClose: () => void;
  onStart: (config: TimedStart) => void;
  /** Reps only: lays the intervals out as sets and narrates them (Done starts each rest). */
  onNarrate: (config: TimedStart) => void;
}) {
  const { t } = useTranslation();
  const reps = exercise !== null && timedKindFor(exercise.metric) === 'reps';
  return (
    <Sheet visible={exercise !== null && timedMethodFits(exercise.metric)} onClose={onClose} title={t('timedMethod.setupTitle')} body={t(reps ? 'timedMethod.setupBodyReps' : 'timedMethod.setupBody')}>
      {exercise ? <Fields key={exercise.entryId} exercise={exercise} onStart={onStart} onNarrate={onNarrate} /> : null}
    </Sheet>
  );
}

function Fields({ exercise, onStart, onNarrate }: { exercise: SessionExercise; onStart: (config: TimedStart) => void; onNarrate: (config: TimedStart) => void }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const kind = timedKindFor(exercise.metric);
  const reps = kind === 'reps';
  const [config] = useState(() => readTimedConfig(exercise.exerciseId, kind));
  const [repsPerRound, setRepsPerRound] = useState(config.repsPerRound ?? 1);
  const [blockSec, setBlockSec] = useState(config.blockSec);
  const [countdownSec, setCountdownSec] = useState(config.countdownSec);
  const [cues, setCues] = useState(() => parseTimedCues(config.cues));
  const [cuesOpen, setCuesOpen] = useState(false);
  const [holdSec, setHoldSec] = useState(config.holdSec);
  const [restSec, setRestSec] = useState(config.restSec);
  const [recoverySec, setRecoverySec] = useState(config.recoverySec);
  const [testSec, setTestSec] = useState(config.testSec || DEFAULT_TIMED_CONFIG.testSec);
  // The recovery and the final hold (or max set) are one optional part: off, the method ends with the block.
  const [withTest, setWithTest] = useState(reps ? config.maxSet === true : config.testSec > 0);
  const rounds = timedRounds({ blockSec, holdSec, restSec });
  const seconds = (value: number) => t('userProgram.secondsValue', { value });
  const startConfig = (): TimedStart => ({
    entryId: exercise.entryId, exerciseId: exercise.exerciseId, blockSec, holdSec, restSec, recoverySec, countdownSec, cues,
    ...(reps ? { kind: 'reps' as const, testSec: 0, repsPerRound, maxSet: withTest, lastMaxReps: config.lastMaxReps ?? null } : { testSec: withTest ? testSec : 0 }),
  });
  const repsText = t('timedMethod.repsCount', { count: repsPerRound });
  const interval = restSec > 0 ? `${seconds(holdSec)} + ${seconds(restSec)}` : seconds(holdSec);
  const summary = reps
    ? t(withTest ? 'timedMethod.summaryReps' : 'timedMethod.summaryRepsNoTest', { count: rounds, rounds, interval, reps: repsText, recovery: formatClock(recoverySec) })
    : withTest ? t('timedMethod.summary', { count: rounds, rounds, hold: seconds(holdSec), rest: seconds(restSec), recovery: formatClock(recoverySec), test: seconds(testSec) })
      : t('timedMethod.summaryNoTest', { count: rounds, rounds, hold: seconds(holdSec), rest: seconds(restSec) });

  const volumePct = Math.round((cues.volume ?? 1) * 100);
  const holdWarn = cues.holdWarningSec ?? 3;
  const restWarn = cues.restWarningSec ?? 3;
  const warnSummary = reps
    ? (restWarn > 0 ? t('timedMethod.warningsRestOnly', { rest: restWarn }) : null)
    : (holdWarn > 0 || restWarn > 0 ? t('timedMethod.warningsSummary', { hold: holdWarn, rest: restWarn }) : null);
  const cuesSummary = volumePct === 0
    ? t('timedMethod.volumeMute')
    : [
      `${volumePct}%`,
      warnSummary,
      t(toneLabelKey(cues.holdStart ? (cues.holdStartTone ?? 'go') : 'none')),
      t(toneLabelKey(cues.restStart ? (cues.restStartTone ?? 'double') : 'none')),
      t(toneLabelKey(cues.milestones ? (cues.milestoneTone ?? 'done') : 'none')),
    ].filter(Boolean).join(' · ');

  return (
    <>
      <View style={styles.fields}>
        <Stepper layout="row" editable clock label={t('timedMethod.block')} value={blockSec} display={formatClock(blockSec)} step={30} min={30} max={1800} presets={[120, 180, 300]} presetLabel={formatClock} onChange={setBlockSec} />
        <Stepper layout="row" editable clock label={t(reps ? 'timedMethod.interval' : 'timedMethod.hold')} value={holdSec} display={seconds(holdSec)} step={5} min={5} max={120} onChange={setHoldSec} />
        {reps ? <Stepper layout="row" editable label={t('timedMethod.repsPerRound')} value={repsPerRound} display={String(repsPerRound)} step={1} min={1} max={30} presets={[1, 2, 3, 5]} onChange={setRepsPerRound} /> : null}
        <Stepper layout="row" editable clock label={t(reps ? 'timedMethod.extraRest' : 'timedMethod.rest')} value={restSec} display={seconds(restSec)} step={5} min={0} max={120} onChange={setRestSec} />
      </View>
      <MenuList>
        <MenuSwitchRow label={t(reps ? 'timedMethod.withMax' : 'timedMethod.withTest')} value={withTest} onChange={setWithTest} />
      </MenuList>
      {withTest ? (
        <View style={styles.fields}>
          <Stepper layout="row" editable clock label={t('timedMethod.recovery')} value={recoverySec} display={formatClock(recoverySec)} step={30} min={30} max={900} presets={[180, 240, 300]} presetLabel={formatClock} onChange={setRecoverySec} />
          {reps ? null : <Stepper layout="row" editable clock label={t('timedMethod.test')} value={testSec} display={seconds(testSec)} step={5} min={5} max={300} presets={[20, 30, 45, 60]} presetLabel={seconds} onChange={setTestSec} />}
        </View>
      ) : null}
      {exercise.unilateral ? <Body>{t('timedMethod.unassignedSides')}</Body> : null}
      <View style={styles.fields}>
        <Label>{t('timedMethod.cues')}</Label>
        <Stepper layout="row" label={t('timedMethod.preparation')} value={countdownSec} display={seconds(countdownSec)} step={1} min={0} max={30} presets={[0, 3, 5, 10]} presetLabel={seconds} onChange={setCountdownSec} />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: cuesOpen }}
          accessibilityLabel={`${t('timedMethod.customizeBeeps')}, ${cuesSummary}`}
          onPress={() => { tapFeedback(); setCuesOpen((open) => !open); }}
          style={({ pressed }) => [styles.cuesToggle, { borderColor: cuesOpen ? palette.accentStrong : palette.border, backgroundColor: cuesOpen ? palette.accentSoft : palette.surface, opacity: pressed ? 0.75 : 1 }]}
        >
          <Icon name={volumePct === 0 ? 'volume-mute-outline' : 'volume-high-outline'} size={20} color={palette.accentStrong} />
          <View style={styles.cuesToggleCopy}>
            <Text style={[styles.cuesToggleTitle, { color: palette.text }]}>{t('timedMethod.customizeBeeps')}</Text>
            <Text style={[styles.cuesToggleValue, { color: palette.textMuted }]}>{cuesSummary}</Text>
          </View>
          <Icon name={cuesOpen ? 'chevron-up' : 'chevron-down'} size={18} color={palette.textMuted} />
        </Pressable>
        {cuesOpen ? <TimedCuesEditor cues={cues} onChange={setCues} reps={reps} /> : null}
      </View>
      <Body>{summary}</Body>
      {reps ? (
        <View style={styles.startActions}>
          <ActionButton icon="volume-high-outline" label={t('timedMethod.startNarrated')} onPress={() => onNarrate(startConfig())} />
          <ActionButton secondary icon="timer-outline" label={t('timedMethod.startTimerReps')} onPress={() => onStart(startConfig())} />
        </View>
      ) : (
        <ActionButton icon="timer-outline" label={t('timedMethod.start')} onPress={() => onStart(startConfig())} />
      )}
    </>
  );
}

const baseStyles = StyleSheet.create({
  fields: { gap: spacing.md },
  startActions: { gap: spacing.sm },
  cuesToggle: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.control,
  },
  cuesToggleCopy: { flex: 1, minWidth: 0, gap: 2 },
  cuesToggleTitle: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19 },
  cuesToggleValue: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16 },
});
