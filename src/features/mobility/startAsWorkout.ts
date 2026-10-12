import * as Crypto from 'expo-crypto';
import { prescriptionsFromSteps } from '../../domain/mobilityImport';
import { getExerciseById } from '../exercises/repository';
import { startPrescribedWorkout } from '../programs/startUserSession';
import { getActiveWorkout } from '../session/repository';
import { getMobilityRoutine } from './routines';

/**
 * Starts a stored routine as a regular workout, under its saved name, with the sets prefilled. Returns
 * the open workout instead when there is one, since only one workout can be in progress.
 */
export async function startRoutineAsWorkout(routineId: string): Promise<{ workoutId: string } | { active: { id: string; name: string } }> {
  const routine = await getMobilityRoutine(routineId);
  if (!routine) throw new Error('Routine not found');
  const open = await getActiveWorkout();
  if (open) return { active: { id: open.id, name: open.name } };
  const ids = [...new Set(routine.steps.map((step) => step.exerciseId))];
  const metrics = new Map(await Promise.all(ids.map(async (id) => [id, (await getExerciseById(id))?.metric] as const)));
  const prescriptions = prescriptionsFromSteps(routine.steps, (id) => metrics.get(id), () => Crypto.randomUUID());
  return { workoutId: await startPrescribedWorkout(routine.name, prescriptions) };
}
