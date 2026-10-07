import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readExerciseRest, writeExerciseRest, type SetKind } from './restDefaults';
import { setEntryRest, setUnilateralRest, type SessionExercise } from './repository';
import { Chip, Label, MenuGroup, SegmentedControl, Stepper } from '../../shared/components/ui';

const REST_STEP_SEC = 15;

/** Rest after working sets and after warm-ups for one exercise; remembered for next workouts too. */
export function ExerciseRestFields({ exercise, onSaved }: { exercise: SessionExercise; onSaved: () => void }) {
  const { t } = useTranslation();
  const { entryId, exerciseId } = exercise;
  const unilateral = Boolean(exercise.unilateral) || exercise.sets.some((set) => set.pairId);
  const [mode, setMode] = useState<'side' | 'pair'>(exercise.unilateralRestMode ?? 'pair');
  const [defaultSaved, setDefaultSaved] = useState(false);
  const [rest, setRest] = useState(() => ({ working: readExerciseRest(exerciseId, 'working'), warmup: readExerciseRest(exerciseId, 'warmup') }));
  const change = (kind: SetKind, seconds: number) => {
    setRest((current) => ({ ...current, [kind]: seconds }));
    writeExerciseRest(exerciseId, kind, seconds);
    void setEntryRest(entryId, kind, seconds).then(onSaved);
  };
  const format = (seconds: number) => t('userProgram.secondsValue', { value: seconds });
  return (
    <MenuGroup title={t('logger.restGroup')}>
      {/* Thumb-sized − and + on the same line as the label; the number can also be typed ("1:30"). */}
      <Stepper layout="row" editable clock label={t('logger.restWorking')} value={rest.working} display={format(rest.working)} step={REST_STEP_SEC} max={600} onChange={(value) => change('working', value)} />
      <Stepper layout="row" editable clock label={t('logger.restWarmup')} value={rest.warmup} display={format(rest.warmup)} step={REST_STEP_SEC} max={600} onChange={(value) => change('warmup', value)} />
      {unilateral ? <>
        <Label>{t('logger.unilateralRest')}</Label>
        <SegmentedControl<'side' | 'pair'>
          value={mode}
          onChange={(next) => { setMode(next); void setUnilateralRest(entryId, next).then(onSaved); }}
          options={[{ value: 'pair', label: t('logger.unilateralRestPair') }, { value: 'side', label: t('logger.unilateralRestSide') }]}
        />
        <Chip icon={defaultSaved ? 'checkmark' : undefined} label={defaultSaved ? t('logger.unilateralRestSaved') : t('logger.unilateralRestDefault')} selected={defaultSaved} onPress={() => void setUnilateralRest(entryId, mode, true).then(() => { setDefaultSaved(true); onSaved(); })} />
      </> : null}
    </MenuGroup>
  );
}
