import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';
import { expandRoutine } from '../../../src/domain/mobilityPlan';
import { getExerciseById } from '../../../src/features/exercises/repository';
import { getMobilityRoutine, type MobilityRoutine } from '../../../src/features/mobility/routines';
import { NarrationPlayer, type NarrationDrill, type NarrationRecord } from '../../../src/features/narration/NarrationPlayer';
import { logCompletedWorkout, type LoggedSetInput } from '../../../src/features/session/repository';
import { PageHeading, Screen } from '../../../src/shared/components/ui';
import { useTheme } from '../../../src/shared/theme/ThemeProvider';

function readCues(value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && typeof parsed[0] === 'string' ? parsed[0] : null;
  } catch {
    return null;
  }
}

export default function MobilityPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
        return { name: exercise?.name ?? '—', cue: exercise ? readCues(exercise.cues) : null, demoUrl: exercise?.demoUrl ?? null, rounds: step.rounds };
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
    router.replace({ pathname: '/workout/summary/[id]', params: { id: workoutId } });
  }, [routine]);

  if (routine === undefined || (routine && drills.length === 0)) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (routine === null) return <Screen><PageHeading title={t('mobility.title')} subtitle={t('mobility.notFound')} /></Screen>;
  return <NarrationPlayer draftKey={`mobility.draft.${id}`} title={routine.name} segments={segments} drills={drills} exitHref="/mobility" onSave={save} />;
}
