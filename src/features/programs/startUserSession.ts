import { isLoadMetric, isTimedMetric, plannedLoads, type UserProgram, type UserProgramSession } from '../../domain/userProgram';
import { addExerciseToWorkout, addSet, getActiveWorkout, getPreviousPerformance, startWorkout, updateSet } from '../session/repository';

/**
 * Starts a workout from one day of a self-made program: every movement gets exactly the planned
 * number of sets, prefilled with the target and rest. Weighted movements take the planned load, or
 * the load used last time when the program leaves it open. Returns the new workout id.
 */
export async function startUserProgramSession(program: UserProgram, session: UserProgramSession): Promise<string> {
  const workoutId = await startWorkout(`${program.name} · ${session.name}`);
  const entries: { entryId: string; index: number }[] = [];
  for (const [index, prescription] of session.exercises.entries()) {
    entries.push({ entryId: await addExerciseToWorkout(workoutId, prescription.exerciseId), index });
  }
  const [active, previous] = await Promise.all([
    getActiveWorkout(workoutId),
    getPreviousPerformance(session.exercises.map((exercise) => exercise.exerciseId), workoutId),
  ]);
  for (const { entryId, index } of entries) {
    const prescription = session.exercises[index];
    const exercise = active?.exercises.find((item) => item.entryId === entryId);
    const metric = exercise?.metric;
    // addExerciseToWorkout already creates the first set: reuse it instead of adding one more.
    const setIds = exercise?.sets.map((set) => set.id) ?? [];
    while (setIds.length < prescription.sets) setIds.push(await addSet(entryId));
    const loads = isLoadMetric(metric)
      ? plannedLoads(prescription, previous.get(prescription.exerciseId)?.sets.map((set) => set.addedLoadKg) ?? [])
      : [];
    for (const [setIndex, setId] of setIds.slice(0, prescription.sets).entries()) {
      await updateSet(setId, 'restSec', prescription.restSeconds);
      if (isTimedMetric(metric)) await updateSet(setId, 'durationSec', prescription.target);
      else if (metric === 'distance') await updateSet(setId, 'distanceM', prescription.target);
      else await updateSet(setId, 'reps', prescription.target);
      if (loads.length > 0) await updateSet(setId, 'addedLoadKg', loads[setIndex]);
    }
  }
  return workoutId;
}
