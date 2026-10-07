import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DurationField } from '../../shared/components/DateTimePickers';
import { readExerciseRest, writeExerciseRest, type SetKind } from './restDefaults';
import { setEntryRest, setUnilateralRest, type SessionExercise } from './repository';
import { Chip, Label, MenuGroup } from '../../shared/components/ui';

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
  return <MenuGroup title={t('logger.restGroup')}>
    {unilateral ? <>
      <Label>{t('logger.unilateralRest')}</Label>
      <View style={styles.choices}>
      <Chip label={t('logger.unilateralRestPair')} selected={mode === 'pair'} onPress={() => { setMode('pair'); void setUnilateralRest(entryId, 'pair').then(onSaved); }} />
      <Chip label={t('logger.unilateralRestSide')} selected={mode === 'side'} onPress={() => { setMode('side'); void setUnilateralRest(entryId, 'side').then(onSaved); }} />
      <Chip icon={defaultSaved ? 'checkmark' : undefined} label={defaultSaved ? t('logger.unilateralRestSaved') : t('logger.unilateralRestDefault')} selected={defaultSaved} onPress={() => void setUnilateralRest(entryId, mode, true).then(() => { setDefaultSaved(true); onSaved(); })} />
      </View>
    </> : null}
    <DurationField label={t('logger.restWorking')} value={rest.working} max={600} presets={[30, 60, 90, 120, 180]} format={(seconds) => t('userProgram.secondsValue', { value: seconds })} onChange={(value) => change('working', value)} />
    <DurationField label={t('logger.restWarmup')} value={rest.warmup} max={600} presets={[30, 60, 90, 120, 180]} format={(seconds) => t('userProgram.secondsValue', { value: seconds })} onChange={(value) => change('warmup', value)} />
  </MenuGroup>;
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
