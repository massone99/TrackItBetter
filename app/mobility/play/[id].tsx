import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';
import { expandRoutine } from '../../../src/domain/mobilityPlan';
import { firstCue } from '../../../src/features/exercises/cues';
import { getExerciseById } from '../../../src/features/exercises/repository';
import { getMobilityRoutine, markMobilityRoutineDone, type MobilityRoutine } from '../../../src/features/mobility/routines';
import { NarrationPlayer, type NarrationDrill, type NarrationRecord } from '../../../src/features/narration/NarrationPlayer';
import { logCompletedWorkout, type LoggedSetInput } from '../../../src/features/session/repository';
import { PageHeading, Screen } from '../../../src/shared/components/ui';
import { useTheme } from '../../../src/shared/theme/ThemeProvider';

export default function MobilityPlayerScreen() {
  const { id, voice } = useLocalSearchParams<{ id: string; voice?: string }>();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [routine, setRoutine] = useState<MobilityRoutine | null | undefined>(undefined);
  const [drills, setDrills] = useState<NarrationDrill[]>([]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const found = await getMobilityRoutine(id);
      if (!mounted) return;
      if (!found) { setRoutine(null); return; }
      const exercises = await Promise.all(found.steps.map((step) => getExerciseById(step.exerciseId)));
      if (!mounted) return;
      setRoutine({
        ...found,
        steps: found.steps.map((step, position) => ({ ...step, perSide: step.perSide || !!exercises[position]?.unilateral, unilateralRestMode: exercises[position]?.unilateralRestMode ?? 'pair' as const })),
      });
      setDrills(found.steps.map((step, position) => {
        const exercise = exercises[position];
        return { name: exercise?.name ?? '—', cue: exercise ? firstCue(exercise.cues) : null, demoUrl: exercise?.demoUrl ?? null, rounds: step.rounds };
      }));
    })();
    return () => { mounted = false; };
  }, [id]);

  // Every drill starts after the routine's countdown, the first one included.
  const segments = useMemo(() => (routine ? expandRoutine(routine) : []), [routine]);

  const save = useCallback(async (records: NarrationRecord[], startedAt: Date) => {
    if (!routine) return;
    const byStep = new Map<number, LoggedSetInput[]>();
    for (const record of records) {
      const sets = byStep.get(record.stepIndex) ?? [];
      sets.push({ pairId: record.side ? `${record.stepIndex}:${record.round}` : null, durationSec: record.seconds, reps: record.reps, side: record.side ?? 'both', completedAt: record.completedAt });
      byStep.set(record.stepIndex, sets);
    }
    const workoutId = await logCompletedWorkout({
      name: routine.name,
      startedAt,
      endedAt: new Date(),
      entries: [...byStep.entries()].sort(([a], [b]) => a - b).map(([stepIndex, sets]) => ({ exerciseId: routine.steps[stepIndex].exerciseId, sets })),
    });
    // A failure to note the run must not undo a saved workout.
    await markMobilityRoutineDone(routine.id, new Date()).catch(() => undefined);
    router.replace({ pathname: '/workout/summary/[id]', params: { id: workoutId } });
  }, [routine]);

  if (routine === undefined || (routine && drills.length === 0)) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (routine === null) return <Screen><PageHeading title={t('mobility.title')} subtitle={t('mobility.notFound')} /></Screen>;
  return <NarrationPlayer draftKey={`mobility.draft.${id}`} title={routine.name} segments={segments} drills={drills} exitHref="/mobility" initialVoice={voice === undefined ? undefined : voice === '1'} onSave={save} />;
}
