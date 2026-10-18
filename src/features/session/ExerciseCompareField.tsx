import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Body, MenuGroup, SegmentedControl } from '../../shared/components/ui';
import { readCompareMode, type CompareMode } from '../../shared/settings/preferences';
import { setEntryCompareWorkout, type SessionExercise } from './repository';

/**
 * What "vs last time" uses for this exercise: its latest time in this workout (same name, e.g. the same
 * program day) or its latest time in any workout. Starts from the Profile default.
 */
export function ExerciseCompareField({ exercise, onChanged }: { exercise: SessionExercise; workoutId?: string; onChanged: () => void }) {
  const { t } = useTranslation();
  const stored = exercise.compareWorkoutId;
  const [mode, setMode] = useState<CompareMode>(stored === '@session' || stored === '@any' ? (stored.slice(1) as CompareMode) : readCompareMode());
  const choose = (next: CompareMode) => {
    setMode(next);
    void setEntryCompareWorkout(exercise.entryId, `@${next}`).then(onChanged);
  };
  return (
    <MenuGroup title={t('compare.title')}>
      <SegmentedControl value={mode} onChange={choose} options={[
        { value: 'session', label: t('compare.modeWorkout') },
        { value: 'any', label: t('compare.modeExercise') },
      ]} />
      <Body>{t(mode === 'session' ? 'compare.workoutHint' : 'compare.exerciseHint')}</Body>
    </MenuGroup>
  );
}
