import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DurationField } from '../../shared/components/DateTimePickers';
import { readExerciseRest, writeExerciseRest, type SetKind } from './restDefaults';
import { getActiveWorkout, setEntryRest, setUnilateralRest } from './repository';
import { Chip, Label } from '../../shared/components/ui';

/** Rest after working sets and after warm-ups for one exercise; remembered for next workouts too. */
export function ExerciseRestFields({ entryId, exerciseId, onSaved }: { entryId: string; exerciseId: string; onSaved: () => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'side' | 'pair'>('pair');
  const [defaultSaved, setDefaultSaved] = useState(false);
  const [unilateral, setUnilateral] = useState(false);
  useEffect(() => { void getActiveWorkout().then((workout) => {
    const exercise = workout?.exercises.find((e) => e.entryId === entryId);
    setUnilateral(!!exercise?.unilateral || !!exercise?.sets.some((s) => s.pairId));
    setMode(exercise?.unilateralRestMode ?? 'pair');
  }); }, [entryId]);
  const [rest, setRest] = useState(() => ({ working: readExerciseRest(exerciseId, 'working'), warmup: readExerciseRest(exerciseId, 'warmup') }));
  const change = (kind: SetKind, seconds: number) => {
    setRest((current) => ({ ...current, [kind]: seconds }));
    writeExerciseRest(exerciseId, kind, seconds);
    void setEntryRest(entryId, kind, seconds).then(onSaved);
  };
  return <>
    {unilateral ? <>
      <Label>{t('logger.unilateralRest')}</Label>
      <Chip label={t('logger.unilateralRestPair')} selected={mode === 'pair'} onPress={() => { setMode('pair'); void setUnilateralRest(entryId, 'pair').then(onSaved); }} />
      <Chip label={t('logger.unilateralRestSide')} selected={mode === 'side'} onPress={() => { setMode('side'); void setUnilateralRest(entryId, 'side').then(onSaved); }} />
      <Chip icon={defaultSaved ? 'checkmark' : undefined} label={defaultSaved ? t('logger.unilateralRestSaved') : t('logger.unilateralRestDefault')} selected={defaultSaved} onPress={() => void setUnilateralRest(entryId, mode, true).then(() => { setDefaultSaved(true); onSaved(); })} />
    </> : null}
    <DurationField label={t('logger.restWorking')} value={rest.working} max={600} presets={[30, 60, 90, 120, 180]} format={(seconds) => t('userProgram.secondsValue', { value: seconds })} onChange={(value) => change('working', value)} />
    <DurationField label={t('logger.restWarmup')} value={rest.warmup} max={600} presets={[30, 60, 90, 120, 180]} format={(seconds) => t('userProgram.secondsValue', { value: seconds })} onChange={(value) => change('warmup', value)} />
  </>;
}
