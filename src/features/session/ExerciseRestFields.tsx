import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Stepper } from '../../shared/components/ui';
import { formatClock } from '../../shared/utils/format';
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
    <Stepper layout="row" label={t('logger.restWorking')} value={rest.working} display={formatClock(rest.working)} step={15} min={0} max={600} onChange={(value) => change('working', value)} />
    <Stepper layout="row" label={t('logger.restWarmup')} value={rest.warmup} display={formatClock(rest.warmup)} step={15} min={0} max={600} onChange={(value) => change('warmup', value)} />
  </>;
}
