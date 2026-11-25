import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ActionButton, Body, Label, MenuList, MenuSwitchRow, Sheet, Stepper } from '../../shared/components/ui';
import { spacing } from '../../shared/theme/tokens';
import { formatClock } from '../../shared/utils/format';
import { timedKindFor, timedRounds, type TimedMethodCues } from '../../domain/timedMethod';
import type { SessionExercise } from './repository';
import { DEFAULT_TIMED_CONFIG, readTimedConfig } from './timedMethodPlan';
import type { TimedStart } from './useTimedMethod';

/** Exercises measured in time run holds; rep exercises run work intervals (with or without load). */
export const timedMethodFits = (metric: string) => metric === 'time' || metric === 'time_load' || metric === 'reps' || metric === 'reps_load';

export function TimedMethodSetupSheet({ exercise, onClose, onStart, onNarrate }: {
  exercise: SessionExercise | null;
  onClose: () => void;
  onStart: (config: TimedStart) => void;
  /** Reps only: lays the intervals out as sets and narrates them (Done starts each rest). */
  onNarrate?: (config: TimedStart) => void;
}) {
  const { t } = useTranslation();
  const reps = exercise !== null && timedKindFor(exercise.metric) === 'reps';
  return (
    <Sheet visible={exercise !== null && timedMethodFits(exercise.metric)} onClose={onClose} title={t('timedMethod.setupTitle')} body={t(reps ? 'timedMethod.setupBodyReps' : 'timedMethod.setupBody')}>
      {exercise ? <Fields key={exercise.entryId} exercise={exercise} onStart={onStart} onNarrate={onNarrate} /> : null}
    </Sheet>
  );
}

function Fields({ exercise, onStart, onNarrate }: { exercise: SessionExercise; onStart: (config: TimedStart) => void; onNarrate?: (config: TimedStart) => void }) {
  const { t } = useTranslation();
  const kind = timedKindFor(exercise.metric);
  const reps = kind === 'reps';
  const [config] = useState(() => readTimedConfig(exercise.exerciseId, kind));
  const [repsPerRound, setRepsPerRound] = useState(config.repsPerRound ?? 1);
  const [blockSec, setBlockSec] = useState(config.blockSec);
  const [countdownSec, setCountdownSec] = useState(config.countdownSec);
  const [cues, setCues] = useState(config.cues);
  function changeCue<K extends keyof TimedMethodCues>(key: K, value: TimedMethodCues[K]) {
    setCues((current) => ({ ...current, [key]: value }));
  }
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
        <Stepper layout="row" label={t('timedMethod.warningSec')} value={cues.warningSec} display={seconds(cues.warningSec)} step={1} min={0} max={10} presets={[0, 1, 3, 5]} presetLabel={seconds} onChange={(value) => changeCue('warningSec', value)} />
        <MenuList>
          <MenuSwitchRow label={t(reps ? 'timedMethod.intervalWarningsReps' : 'timedMethod.intervalWarnings')} value={cues.intervalWarnings} onChange={(value) => changeCue('intervalWarnings', value)} />
          <MenuSwitchRow label={t(reps ? 'timedMethod.intervalCue' : 'timedMethod.holdCue')} value={cues.holdStart} onChange={(value) => changeCue('holdStart', value)} />
          <MenuSwitchRow label={t('timedMethod.restCue')} value={cues.restStart} onChange={(value) => changeCue('restStart', value)} />
          <MenuSwitchRow label={t('timedMethod.milestoneCue')} value={cues.milestones} onChange={(value) => changeCue('milestones', value)} />
        </MenuList>
      </View>
      <Body>{summary}</Body>
      <ActionButton icon="timer-outline" label={t('timedMethod.start')} onPress={() => onStart(startConfig())} />
      {reps && onNarrate ? (
        <>
          <ActionButton variant="secondary" icon="volume-high-outline" label={t('timedMethod.startNarrated')} onPress={() => onNarrate(startConfig())} />
          <Body>{t('timedMethod.narratedHint')}</Body>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({ fields: { gap: spacing.md } });
