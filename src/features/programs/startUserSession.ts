import { isLoadMetric, isTimedMetric, plannedLoads, programSessionWorkoutName, type UserProgram, type UserProgramSession } from '../../domain/userProgram';
import { getExerciseById } from '../exercises/repository';
import { addExerciseToWorkout, addSet, convertToPastWorkout, deleteWorkout, getActiveWorkout, getPreviousPerformance, startWorkout, updateEntryNote, updateSet } from '../session/repository';

/**
 * Starts a workout from one day of a self-made program: every movement gets exactly the planned
 * number of sets, prefilled with the target and rest. Weighted movements take the planned load, or
 * the load used last time when the program leaves it open. Movements that no longer exist in the
 * library are skipped. If the workout cannot be built, nothing is left behind: a half-made workout
 * would stay open and block starting any other. Returns the new workout id.
 */
export async function startUserProgramSession(program: UserProgram, session: UserProgramSession): Promise<string> {
  const known = (await Promise.all(session.exercises.map(async (prescription) => ((await getExerciseById(prescription.exerciseId)) ? prescription : null))))
    .filter((prescription): prescription is UserProgramSession['exercises'][number] => prescription !== null);
  if (known.length === 0) throw new Error('None of the movements of this workout exist any more.');
  const workoutId = await startWorkout(programSessionWorkoutName(program, session));
  try {
    await fillWorkout(workoutId, known);
  } catch (error) {
    await deleteWorkout(workoutId).catch(() => undefined);
    throw error;
  }
  return workoutId;
}

/**
 * Logs one day of a program as a session that already happened: the same sets, targets and loads
 * as starting it, all marked done, starting at `startedAt`. Returns the finished workout's id.
 */
export async function logPastUserProgramSession(program: UserProgram, session: UserProgramSession, startedAt: Date, minutes: number): Promise<string> {
  const known = (await Promise.all(session.exercises.map(async (prescription) => ((await getExerciseById(prescription.exerciseId)) ? prescription : null))))
    .filter((prescription): prescription is UserProgramSession['exercises'][number] => prescription !== null);
  if (known.length === 0) throw new Error('None of the movements of this workout exist any more.');
  const workoutId = await startWorkout(programSessionWorkoutName(program, session));
  try {
    await fillWorkout(workoutId, known);
    await convertToPastWorkout(workoutId, startedAt, minutes);
  } catch (error) {
    await deleteWorkout(workoutId).catch(() => undefined);
    throw error;
  }
  return workoutId;
}

async function fillWorkout(workoutId: string, exercises: UserProgramSession['exercises']): Promise<void> {
  const entries: { entryId: string; index: number }[] = [];
  for (const [index, prescription] of exercises.entries()) {
    entries.push({ entryId: await addExerciseToWorkout(workoutId, prescription.exerciseId), index });
  }
  const [active, previous] = await Promise.all([
    getActiveWorkout(workoutId),
    getPreviousPerformance(exercises.map((exercise) => exercise.exerciseId), workoutId),
  ]);
  for (const { entryId, index } of entries) {
    const prescription = exercises[index];
    const exercise = active?.exercises.find((item) => item.entryId === entryId);
    const metric = exercise?.metric;
    // addExerciseToWorkout already creates the first set: reuse it instead of adding one more.
    const setIds = exercise?.sets.map((set) => set.id) ?? [];
    while (setIds.length < prescription.sets) setIds.push(await addSet(entryId));
    const previousSets = previous.get(prescription.exerciseId)?.sets ?? [];
    if (prescription.note?.trim()) await updateEntryNote(entryId, prescription.note);
    const loads = isLoadMetric(metric)
      ? plannedLoads(prescription, previous.get(prescription.exerciseId)?.sets.map((set) => set.addedLoadKg) ?? [])
      : [];
    for (const [setIndex, setId] of setIds.slice(0, prescription.sets).entries()) {
      // Without a rest of its own the set keeps none, and the exercise's or Profile's rest applies.
      if (prescription.restSeconds != null) await updateSet(setId, 'restSec', prescription.restSeconds);
      if (prescription.target !== null) {
        if (isTimedMetric(metric)) await updateSet(setId, 'durationSec', prescription.target);
        else if (metric === 'distance') await updateSet(setId, 'distanceM', prescription.target);
        else await updateSet(setId, 'reps', prescription.target);
      } else {
        // An open target starts from last time's set at the same position, when there is one.
        const last = previousSets[Math.min(setIndex, previousSets.length - 1)];
        if (last) {
          if (isTimedMetric(metric) && last.durationSec) await updateSet(setId, 'durationSec', last.durationSec);
          else if (metric === 'distance' && last.distanceM) await updateSet(setId, 'distanceM', last.distanceM);
          else if (!isTimedMetric(metric) && metric !== 'distance' && last.reps) await updateSet(setId, 'reps', last.reps);
        }
      }
      if (loads.length > 0) await updateSet(setId, 'addedLoadKg', loads[setIndex]);
    }
  }
}
