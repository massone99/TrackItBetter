import { isLoadMetric, isTimedMetric, plannedLoads, programSessionWorkoutName, type UserProgram, type UserProgramSession } from '../../domain/userProgram';
import { groupSets } from '../../domain/setPairs';
import { getExerciseById } from '../exercises/repository';
import { addExerciseToWorkout, addSet, convertToPastWorkout, deleteWorkout, getActiveWorkout, getPreviousPerformance, startWorkout, updateEntryNote, updateSet } from '../session/repository';

type PreviousProgramSet = {
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
  addedLoadKg: number;
  rpe?: number | null;
  note?: string | null;
  pairId?: string | null;
  side?: string;
};

/** Previous-performance rows were historically side-less; retain that format as a fallback. */
function previousForSide(sets: readonly PreviousProgramSet[], setIndex: number, side: string | undefined, unilateral: boolean): PreviousProgramSet | undefined {
  if (!unilateral || !side) return sets[setIndex];
  const hasSideData = sets.some((set) => set.side === 'left' || set.side === 'right' || set.pairId);
  if (!hasSideData) return sets[setIndex];
  const sideSets = sets.filter((set) => set.side === side);
  return sideSets[setIndex];
}

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
    // A unilateral addSet returns the first id but inserts both sides, so reload after every add
    // and count groups rather than raw rows.
    let setRows = exercise?.sets ?? [];
    while (groupSets(setRows).length < prescription.sets) {
      await addSet(entryId);
      const refreshed = await getActiveWorkout(workoutId);
      setRows = refreshed?.exercises.find((item) => item.entryId === entryId)?.sets ?? setRows;
    }
    const unilateral = exercise?.unilateral === true;
    const setGroups = groupSets(setRows).slice(0, prescription.sets);
    const previousSets = (previous.get(prescription.exerciseId)?.sets ?? []) as PreviousProgramSet[];
    if (prescription.note?.trim()) await updateEntryNote(entryId, prescription.note);
    const loads = isLoadMetric(metric)
      ? plannedLoads(prescription, previous.get(prescription.exerciseId)?.sets.map((set) => set.addedLoadKg) ?? [])
      : [];
    for (const [setIndex, group] of setGroups.entries()) {
      for (const set of group) {
        const side = unilateral ? set.side : undefined;
        const last = previousForSide(previousSets, setIndex, side, unilateral);
        // Without a rest of its own the set keeps none, and the exercise's or Profile's rest applies.
        if (prescription.restSeconds != null) await updateSet(set.id, 'restSec', prescription.restSeconds);
        if (prescription.target !== null) {
          if (isTimedMetric(metric)) await updateSet(set.id, 'durationSec', prescription.target);
          else if (metric === 'distance') await updateSet(set.id, 'distanceM', prescription.target);
          else await updateSet(set.id, 'reps', prescription.target);
        } else if (last) {
          // An open target starts from last time's set at the same position and side, when there is one.
          if (isTimedMetric(metric) && last.durationSec != null) await updateSet(set.id, 'durationSec', last.durationSec);
          else if (metric === 'distance' && last.distanceM != null) await updateSet(set.id, 'distanceM', last.distanceM);
          else if (!isTimedMetric(metric) && metric !== 'distance' && last.reps != null) await updateSet(set.id, 'reps', last.reps);
        }
        const load = prescription.loadKg != null ? prescription.loadKg : (last?.addedLoadKg ?? (loads.length > 0 ? loads[setIndex] : undefined));
        if (load != null && loads.length > 0) await updateSet(set.id, 'addedLoadKg', load);
      }
    }
  }
}
