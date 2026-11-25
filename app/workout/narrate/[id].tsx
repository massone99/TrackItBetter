import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';
import { buildNarrationPlan, type NarrationExercise } from '../../../src/domain/narration';
import { groupSets } from '../../../src/domain/setPairs';
import { firstCue } from '../../../src/features/exercises/cues';
import { getExerciseById } from '../../../src/features/exercises/repository';
import { NarrationPlayer, type NarrationDrill, type NarrationRecord } from '../../../src/features/narration/NarrationPlayer';
import { PREP_VOICE_KEY, WORK_VOICE_KEY, readAnnouncementWaitSec, readNarrationPrepSec } from '../../../src/features/narration/settings';
import { restForSet } from '../../../src/features/session/restDefaults';
import { completeSet, getActiveWorkout, uncompleteSet, type ActiveWorkout } from '../../../src/features/session/repository';
import { readTimedNarration, rememberMaxReps, writeTimedNarration } from '../../../src/features/session/timedMethodPlan';
import { PageHeading, Screen } from '../../../src/shared/components/ui';
import { readBooleanPreference } from '../../../src/shared/settings/preferences';
import { useTheme } from '../../../src/shared/theme/ThemeProvider';

/**
 * Hands-free session over a workout's open sets: announces, counts down, rests, and marks each set done. With
 * `timed=1` it narrates only the intervals a reps timed method laid out: the user says when the reps are done and
 * the rest of the interval starts.
 */
export default function NarratedWorkoutScreen() {
  const { id, timed: timedParam } = useLocalSearchParams<{ id: string; timed?: string }>();
  // Read once: the block is fixed for the whole narration.
  const [timed] = useState(() => (timedParam === '1' && id ? readTimedNarration(id) : null));
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [workout, setWorkout] = useState<ActiveWorkout | null | undefined>(undefined);
  const [drills, setDrills] = useState<NarrationDrill[]>([]);
  // Read once: changing the setting while narrating must not rebuild the plan under the player.
  const [announcementWaitSec] = useState(readAnnouncementWaitSec);
  const [workVoice] = useState(() => readBooleanPreference(WORK_VOICE_KEY, true));
  const [prepVoice] = useState(() => readBooleanPreference(PREP_VOICE_KEY, true));
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
        // A timed block counts only its own intervals.
        rounds: timed && exercise.entryId === timed.entryId ? timed.setIds.length : groupSets(exercise.sets).length,
      })));
      setWorkout(found);
    })();
    return () => { mounted = false; };
  }, [id, timed]);

  const segments = useMemo(() => {
    if (!workout) return [];
    const chain = timed?.setIds ?? [];
    const exercises: NarrationExercise[] = workout.exercises.map((exercise) => ({
      entryId: exercise.entryId,
      // The timed block is one exercise on its own: no superset rounds.
      groupId: timed ? null : exercise.groupId,
      groupType: timed ? null : exercise.groupType,
      unilateralRestMode: exercise.unilateralRestMode,
      sets: exercise.sets.filter((set) => !timed || (exercise.entryId === timed.entryId && chain.includes(set.id))).map((set) => ({
        id: set.id, pairId: set.pairId, side: set.side, durationSec: set.durationSec, reps: set.reps,
        restSec: restForSet(exercise.exerciseId, set), done: !!set.completedAt,
        chained: chain.indexOf(set.id) > 0 && set.note !== 'Timed · max reps',
      })),
    }));
    return buildNarrationPlan(exercises, timed?.prepSec ?? prepSec);
  }, [workout, prepSec, timed]);

  const writes = useRef(Promise.resolve());
  const persistRecord = useCallback(async (record: NarrationRecord) => {
    const values = record.seconds != null ? { durationSec: record.seconds } : record.reps != null ? { reps: record.reps } : undefined;
    for (const setId of record.setIds ?? []) await completeSet(setId, record.completedAt, values);
  }, []);

  const save = useCallback(async (records: NarrationRecord[]) => {
    await writes.current;
    for (const record of records) await persistRecord(record);
    if (timed && id) {
      const exercise = workout?.exercises.find((item) => item.entryId === timed.entryId);
      const maxSet = exercise?.sets.find((set) => timed.setIds.includes(set.id) && set.note === 'Timed · max reps');
      const max = maxSet && records.find((record) => record.setIds?.includes(maxSet.id));
      if (exercise && max?.reps != null) rememberMaxReps(exercise.exerciseId, max.reps);
      writeTimedNarration(id, null);
    }
    router.replace({ pathname: '/workout/[id]', params: { id } });
  }, [id, timed, workout, persistRecord]);

  // Apply confirmations and reopens in tap order, even when the database is still writing.
  const segmentDone = useCallback((record: NarrationRecord) => {
    writes.current = writes.current.then(() => persistRecord(record)).catch(() => undefined);
  }, [persistRecord]);
  const segmentReopened = useCallback((setIds: string[]) => {
    writes.current = writes.current.then(async () => {
      for (const setId of setIds) await uncompleteSet(setId);
    }).catch(() => undefined);
  }, []);

  if (workout === undefined) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (workout === null) return <Screen><PageHeading title={t('workout.unavailable')} subtitle={t('workout.finished')} /></Screen>;
  return <NarrationPlayer editablePrescription announcementWaitSec={announcementWaitSec} workVoice={workVoice} prepVoice={prepVoice} draftKey={timed ? `narration.draft.${id}.timed` : `narration.draft.${id}`} title={workout.name} segments={segments} drills={drills} exitHref={{ pathname: '/workout/[id]', params: { id } }} onSave={save} onSegmentDone={segmentDone} onSegmentReopened={segmentReopened} checkPairs={false} />;
}
