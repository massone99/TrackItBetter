import { deleteWorkout } from './repository';
import { cancelRestFinishedNotification } from './restNotifications';
import { clearEmomPlan } from './emomPlan';

/**
 * Throws away a workout still in progress, from any screen: the workout and its sets, then what
 * belongs to it outside the database (the rest alert and its live countdown, a running EMOM).
 * The workout screen stops its own timers and speech itself.
 */
export async function discardActiveWorkout(workoutId: string): Promise<void> {
  await deleteWorkout(workoutId);
  clearEmomPlan(workoutId);
  void cancelRestFinishedNotification().catch(() => undefined);
}
