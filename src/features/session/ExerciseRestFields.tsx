import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DurationField } from '../../shared/components/DateTimePickers';
import { readExerciseRest, writeExerciseRest, type SetKind } from './restDefaults';
import { setEntryRest } from './repository';

/** Rest after working sets and after warm-ups for one exercise; remembered for next workouts too. */
export function ExerciseRestFields({ entryId, exerciseId, onSaved }: { entryId: string; exerciseId: string; onSaved: () => void }) {
  const { t } = useTranslation();
  const [rest, setRest] = useState(() => ({ working: readExerciseRest(exerciseId, 'working'), warmup: readExerciseRest(exerciseId, 'warmup') }));
  const change = (kind: SetKind, seconds: number) => {
    setRest((current) => ({ ...current, [kind]: seconds }));
    writeExerciseRest(exerciseId, kind, seconds);
    void setEntryRest(entryId, kind, seconds).then(onSaved);
  };
  return <>
    <DurationField label={t('logger.restWorking')} value={rest.working} max={600} format={(seconds) => t('userProgram.secondsValue', { value: seconds })} onChange={(value) => change('working', value ?? rest.working)} />
    <DurationField label={t('logger.restWarmup')} value={rest.warmup} max={600} format={(seconds) => t('userProgram.secondsValue', { value: seconds })} onChange={(value) => change('warmup', value ?? rest.warmup)} />
  </>;
}
