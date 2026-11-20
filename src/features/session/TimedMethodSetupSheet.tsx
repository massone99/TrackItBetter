import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ActionButton, Body, Label, MenuList, MenuSwitchRow, Sheet, Stepper } from '../../shared/components/ui';
import { spacing } from '../../shared/theme/tokens';
import { formatClock } from '../../shared/utils/format';
import { timedRounds, type TimedMethodCues } from '../../domain/timedMethod';
import type { SessionExercise } from './repository';
import { DEFAULT_TIMED_CONFIG, readTimedConfig } from './timedMethodPlan';
import type { TimedStart } from './useTimedMethod';

/** The timed method needs a hold: exercises measured in time (with or without load). */
export const timedMethodFits = (metric: string) => metric === 'time' || metric === 'time_load';

export function TimedMethodSetupSheet({ exercise, onClose, onStart }: { exercise: SessionExercise | null; onClose: () => void; onStart: (config: TimedStart) => void }) {
  const { t } = useTranslation();
  return (
    <Sheet visible={exercise !== null && timedMethodFits(exercise.metric)} onClose={onClose} title={t('timedMethod.setupTitle')} body={t('timedMethod.setupBody')}>
      {exercise ? <Fields key={exercise.entryId} exercise={exercise} onStart={onStart} /> : null}
    </Sheet>
  );
}

function Fields({ exercise, onStart }: { exercise: SessionExercise; onStart: (config: TimedStart) => void }) {
  const { t } = useTranslation();
  const [config] = useState(() => readTimedConfig(exercise.exerciseId));
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
  // The recovery and the final hold are one optional part: off, the method ends with the block.
  const [withTest, setWithTest] = useState(config.testSec > 0);
  const rounds = timedRounds({ blockSec, holdSec, restSec });
  const seconds = (value: number) => t('userProgram.secondsValue', { value });
  return (
    <>
      <View style={styles.fields}>
        <Stepper layout="row" editable clock label={t('timedMethod.block')} value={blockSec} display={formatClock(blockSec)} step={30} min={30} max={1800} presets={[120, 180, 300]} presetLabel={formatClock} onChange={setBlockSec} />
        <Stepper layout="row" editable clock label={t('timedMethod.hold')} value={holdSec} display={seconds(holdSec)} step={5} min={5} max={120} onChange={setHoldSec} />
        <Stepper layout="row" editable clock label={t('timedMethod.rest')} value={restSec} display={seconds(restSec)} step={5} min={0} max={120} onChange={setRestSec} />
      </View>
      <MenuList>
        <MenuSwitchRow label={t('timedMethod.withTest')} value={withTest} onChange={setWithTest} />
      </MenuList>
      {withTest ? (
        <View style={styles.fields}>
          <Stepper layout="row" editable clock label={t('timedMethod.recovery')} value={recoverySec} display={formatClock(recoverySec)} step={30} min={30} max={900} presets={[180, 240, 300]} presetLabel={formatClock} onChange={setRecoverySec} />
          <Stepper layout="row" editable clock label={t('timedMethod.test')} value={testSec} display={seconds(testSec)} step={5} min={5} max={300} presets={[20, 30, 45, 60]} presetLabel={seconds} onChange={setTestSec} />
        </View>
      ) : null}
      {exercise.unilateral ? <Body>{t('timedMethod.unassignedSides')}</Body> : null}
      <View style={styles.fields}>
        <Label>{t('timedMethod.cues')}</Label>
        <Stepper layout="row" label={t('timedMethod.preparation')} value={countdownSec} display={seconds(countdownSec)} step={1} min={0} max={30} presets={[0, 3, 5, 10]} presetLabel={seconds} onChange={setCountdownSec} />
        <Stepper layout="row" label={t('timedMethod.warningSec')} value={cues.warningSec} display={seconds(cues.warningSec)} step={1} min={0} max={10} presets={[0, 1, 3, 5]} presetLabel={seconds} onChange={(value) => changeCue('warningSec', value)} />
        <MenuList>
          <MenuSwitchRow label={t('timedMethod.intervalWarnings')} value={cues.intervalWarnings} onChange={(value) => changeCue('intervalWarnings', value)} />
          <MenuSwitchRow label={t('timedMethod.holdCue')} value={cues.holdStart} onChange={(value) => changeCue('holdStart', value)} />
          <MenuSwitchRow label={t('timedMethod.restCue')} value={cues.restStart} onChange={(value) => changeCue('restStart', value)} />
          <MenuSwitchRow label={t('timedMethod.milestoneCue')} value={cues.milestones} onChange={(value) => changeCue('milestones', value)} />
        </MenuList>
      </View>
      <Body>{withTest ? t('timedMethod.summary', { count: rounds, rounds, hold: seconds(holdSec), rest: seconds(restSec), recovery: formatClock(recoverySec), test: seconds(testSec) }) : t('timedMethod.summaryNoTest', { count: rounds, rounds, hold: seconds(holdSec), rest: seconds(restSec) })}</Body>
      <ActionButton icon="timer-outline" label={t('timedMethod.start')} onPress={() => onStart({ entryId: exercise.entryId, exerciseId: exercise.exerciseId, blockSec, holdSec, restSec, recoverySec, countdownSec, cues, testSec: withTest ? testSec : 0 })} />
    </>
  );
}

const styles = StyleSheet.create({ fields: { gap: spacing.md } });
