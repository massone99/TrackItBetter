import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ActionButton, Body, Sheet, Stepper } from '../../shared/components/ui';
import { formatClock } from '../../shared/utils/format';
import { groupSets } from '../../domain/setPairs';
import type { EmomStart } from './useEmom';
import type { SessionExercise } from './repository';

/** EMOM only fits exercises counted in reps or held for a time. */
export function emomFieldFor(metric: string): EmomStart['field'] | null {
  if (metric === 'reps' || metric === 'reps_load') return 'reps';
  if (metric === 'time' || metric === 'time_load') return 'durationSec';
  return null;
}

/** Rounds default to the planned sets still to do; the target to the next of them (else the last set). */
export function emomDefaults(exercise: SessionExercise): Pick<EmomStart, 'rounds' | 'target' | 'intervalSec'> {
  const field = emomFieldFor(exercise.metric) ?? 'reps';
  const working = groupSets(exercise.sets).filter((group) => group[0].kind === 'working');
  const open = working.filter((group) => group.every((set) => !set.completedAt));
  const source = open[0]?.[0] ?? working[working.length - 1]?.[0];
  const value = source ? (field === 'reps' ? source.reps : source.durationSec) : null;
  return { rounds: open.length >= 2 ? open.length : 10, target: value && value > 0 ? value : field === 'reps' ? 5 : 20, intervalSec: 60 };
}

export function EmomSetupSheet({ exercise, onClose, onStart }: {
  exercise: SessionExercise | null;
  onClose: () => void;
  onStart: (config: EmomStart) => void;
}) {
  const { t } = useTranslation();
  const field = exercise ? emomFieldFor(exercise.metric) : null;
  return (
    <Sheet visible={exercise !== null && field !== null} onClose={onClose} title={t('emom.setupTitle')} body={t('emom.setupBody')}>
      {exercise && field ? <EmomFields key={exercise.entryId} exercise={exercise} field={field} onStart={onStart} /> : null}
    </Sheet>
  );
}

function EmomFields({ exercise, field, onStart }: { exercise: SessionExercise; field: EmomStart['field']; onStart: (config: EmomStart) => void }) {
  const { t } = useTranslation();
  const [defaults] = useState(() => emomDefaults(exercise));
  const [rounds, setRounds] = useState(defaults.rounds);
  const [intervalSec, setIntervalSec] = useState(defaults.intervalSec);
  const [target, setTarget] = useState(defaults.target);
  return (
    <>
      <View style={styles.fields}>
        <Stepper layout="row" label={t('emom.rounds')} value={rounds} min={1} max={60} editable onChange={setRounds} />
        <Stepper layout="row" label={t('emom.interval')} value={intervalSec} display={formatClock(intervalSec)} step={15} min={15} max={300} presets={[30, 60, 120]} presetLabel={formatClock} onChange={setIntervalSec} />
        <Stepper
          layout="row"
          label={field === 'durationSec' ? t('emom.targetHold') : t('emom.targetReps')}
          value={target}
          display={field === 'durationSec' ? formatClock(target) : undefined}
          step={field === 'durationSec' ? 5 : 1}
          min={1}
          max={field === 'durationSec' ? Math.max(5, intervalSec - 5) : 100}
          editable
          clock={field === 'durationSec'}
          onChange={setTarget}
        />
      </View>
      <Body>{t('emom.summary', { rounds, time: formatClock(rounds * intervalSec) })}</Body>
      <ActionButton icon="timer-outline" label={t('emom.start')} onPress={() => onStart({ entryId: exercise.entryId, field, rounds, intervalSec, target })} />
    </>
  );
}

const styles = StyleSheet.create({ fields: { gap: 12 } });
