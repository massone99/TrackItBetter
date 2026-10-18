import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';
import { buildNarrationPlan, type NarrationExercise } from '../../../src/domain/narration';
import { groupSets } from '../../../src/domain/setPairs';
import { firstCue } from '../../../src/features/exercises/cues';
import { getExerciseById } from '../../../src/features/exercises/repository';
import { NarrationPlayer, type NarrationDrill, type NarrationRecord } from '../../../src/features/narration/NarrationPlayer';
import { readNarrationPrepSec } from '../../../src/features/narration/settings';
import { restForSet } from '../../../src/features/session/restDefaults';
import { completeSet, getActiveWorkout, type ActiveWorkout } from '../../../src/features/session/repository';
import { PageHeading, Screen } from '../../../src/shared/components/ui';
import { useTheme } from '../../../src/shared/theme/ThemeProvider';

/** Hands-free session over a workout's open sets: announces, counts down, rests, and marks each set done. */
export default function NarratedWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [workout, setWorkout] = useState<ActiveWorkout | null | undefined>(undefined);
  const [drills, setDrills] = useState<NarrationDrill[]>([]);
  // Read once: changing the setting while narrating must not rebuild the plan under the player.
  const [prepSec] = useState(readNarrationPrepSec);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const found = await getActiveWorkout(id);
      if (!mounted) return;
      if (!found) { setWorkout(null); return; }
      const exercises = await Promise.all(found.exercises.map((exercise) => getExerciseById(exercise.exerciseId)));
      if (!mounted) return;
      setDrills(found.exercises.map((exercise, position) => ({
        name: exercise.name,
        cue: exercises[position] ? firstCue(exercises[position]!.cues) : null,
        demoUrl: exercise.demoUrl,
        rounds: groupSets(exercise.sets).length,
      })));
      setWorkout(found);
    })();
    return () => { mounted = false; };
  }, [id]);

  const segments = useMemo(() => {
    if (!workout) return [];
    const exercises: NarrationExercise[] = workout.exercises.map((exercise) => ({
      entryId: exercise.entryId,
      groupId: exercise.groupId,
      groupType: exercise.groupType,
      unilateralRestMode: exercise.unilateralRestMode,
      sets: exercise.sets.map((set) => ({
        id: set.id, pairId: set.pairId, side: set.side, durationSec: set.durationSec, reps: set.reps,
        restSec: restForSet(exercise.exerciseId, set), done: !!set.completedAt,
      })),
    }));
    return buildNarrationPlan(exercises, prepSec);
  }, [workout, prepSec]);

  const save = useCallback(async (records: NarrationRecord[]) => {
    for (const record of records) {
      for (const setId of record.setIds ?? []) await completeSet(setId, record.completedAt);
    }
    router.replace({ pathname: '/workout/[id]', params: { id } });
  }, [id]);

  if (workout === undefined) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (workout === null) return <Screen><PageHeading title={t('workout.unavailable')} subtitle={t('workout.finished')} /></Screen>;
  return <NarrationPlayer draftKey={`narration.draft.${id}`} title={workout.name} segments={segments} drills={drills} exitHref={{ pathname: '/workout/[id]', params: { id } }} onSave={save} checkPairs={false} />;
}
