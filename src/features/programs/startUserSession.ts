import { isLoadMetric, isTimedMetric, plannedLoads, programSessionWorkoutName, targetRpeFor, type UserProgram, type UserProgramSession } from '../../domain/userProgram';
import { getExerciseById } from '../exercises/repository';
import { addPlannedEntries, convertToPastWorkout, deleteWorkout, getPreviousPerformance, startWorkout, type PlannedEntry, type PlannedSet } from '../session/repository';

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

type Prescription = UserProgramSession['exercises'][number];
type KnownPrescription = { prescription: Prescription; metric: string; unilateral: boolean };

/** The prescriptions whose exercise still exists, with how that exercise is measured. */
async function knownPrescriptions(prescriptions: readonly Prescription[]): Promise<KnownPrescription[]> {
  const found = await Promise.all(prescriptions.map(async (prescription): Promise<KnownPrescription | null> => {
    const exercise = await getExerciseById(prescription.exerciseId);
    return exercise ? { prescription, metric: exercise.metric, unilateral: exercise.unilateral === true } : null;
  }));
  const known = found.filter((item): item is KnownPrescription => item !== null);
  if (known.length === 0) throw new Error('None of the movements of this workout exist any more.');
  return known;
}

/**
 * Starts a workout named `name` from a list of prescriptions (a day of a self-made program or of a
 * template): every movement gets exactly the planned number of sets, prefilled with the target and
 * rest. Weighted movements take the planned load, or the load used last time when the plan leaves it
 * open. Movements that no longer exist in the library are skipped. If the workout cannot be built,
 * nothing is left behind: a half-made workout would stay open and block starting any other. Returns
 * the new workout id.
 */
export async function startPrescribedWorkout(name: string, prescriptions: readonly Prescription[], notes?: string | null): Promise<string> {
  const known = await knownPrescriptions(prescriptions);
  const workoutId = await startWorkout(name, notes);
  try {
    await fillWorkout(workoutId, known);
  } catch (error) {
    await deleteWorkout(workoutId).catch(() => undefined);
    throw error;
  }
  return workoutId;
}

/** Starts one day of a self-made program; see `startPrescribedWorkout`. */
export async function startUserProgramSession(program: UserProgram, session: UserProgramSession): Promise<string> {
  return startPrescribedWorkout(programSessionWorkoutName(program, session), session.exercises, session.notes);
}

/**
 * Logs one day of a program as a session that already happened: the same sets, targets and loads
 * as starting it, all marked done, starting at `startedAt`. Returns the finished workout's id.
 */
export async function logPastUserProgramSession(program: UserProgram, session: UserProgramSession, startedAt: Date, minutes: number): Promise<string> {
  const known = await knownPrescriptions(session.exercises);
  const workoutId = await startWorkout(programSessionWorkoutName(program, session), session.notes);
  try {
    await fillWorkout(workoutId, known);
    await convertToPastWorkout(workoutId, startedAt, minutes);
  } catch (error) {
    await deleteWorkout(workoutId).catch(() => undefined);
    throw error;
  }
  return workoutId;
}

/** The value a new set starts from before the plan fills it in, as `addSet` would. */
function initialValues(metric: string): Pick<PlannedSet[number], 'reps' | 'durationSec' | 'distanceM'> {
  if (isTimedMetric(metric)) return { reps: null, durationSec: 10, distanceM: null };
  if (metric === 'distance') return { reps: null, durationSec: null, distanceM: 10 };
  return { reps: 8, durationSec: null, distanceM: null };
}

/** Builds every set in memory from the plan and last time, then writes them in one transaction. */
async function fillWorkout(workoutId: string, known: readonly KnownPrescription[]): Promise<void> {
  const previous = await getPreviousPerformance(known.map(({ prescription }) => prescription.exerciseId), workoutId);
  const planned: PlannedEntry[] = known.map(({ prescription, metric, unilateral }) => {
    const previousSets = (previous.get(prescription.exerciseId)?.sets ?? []) as PreviousProgramSet[];
    const loads = isLoadMetric(metric) ? plannedLoads(prescription, previousSets.map((set) => set.addedLoadKg)) : [];
    const sides = unilateral ? (['left', 'right'] as const) : (['both'] as const);
    // At least one set, as an exercise added to a workout always has.
    const sets = Array.from({ length: Math.max(1, prescription.sets) }, (_, setIndex): PlannedSet => sides.map((side) => {
      const values = { ...initialValues(metric) };
      const last = previousForSide(previousSets, setIndex, unilateral ? side : undefined, unilateral);
      if (prescription.target !== null) {
        if (isTimedMetric(metric)) values.durationSec = prescription.target;
        else if (metric === 'distance') values.distanceM = prescription.target;
        else values.reps = prescription.target;
      } else if (last) {
        // An open target starts from last time's set at the same position and side, when there is one.
        if (isTimedMetric(metric) && last.durationSec != null) values.durationSec = last.durationSec;
        else if (metric === 'distance' && last.distanceM != null) values.distanceM = last.distanceM;
        else if (!isTimedMetric(metric) && metric !== 'distance' && last.reps != null) values.reps = last.reps;
      }
      const load = prescription.loadKg != null ? prescription.loadKg : (last?.addedLoadKg ?? (loads.length > 0 ? loads[setIndex] : undefined));
      return {
        side,
        ...values,
        addedLoadKg: load != null && loads.length > 0 ? load : 0,
        // Without a rest of its own the set keeps none, and the exercise's or Profile's rest applies.
        restSec: prescription.restSeconds ?? null,
        targetRpe: targetRpeFor(prescription, setIndex),
      };
    }));
    return { exerciseId: prescription.exerciseId, notes: prescription.note, sets };
  });
  await addPlannedEntries(workoutId, planned);
}
