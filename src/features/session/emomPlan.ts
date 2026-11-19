import { parseEmomPlan, type EmomPlan } from '../../domain/emom';
import { readPreference, writePreference } from '../../shared/settings/preferences';
import { cancelEmomNotifications } from './restNotifications';

/** Where a workout's EMOM plan is kept on the device. */
export const emomPlanKey = (workoutId: string) => `workout.emom.${workoutId}`;

export function readEmomPlan(workoutId: string): EmomPlan | null {
  const plan = parseEmomPlan(readPreference(emomPlanKey(workoutId)));
  return plan?.workoutId === workoutId ? plan : null;
}

/** Forgets the EMOM of a workout, e.g. when the workout is discarded. */
export function clearEmomPlan(workoutId: string): void {
  writePreference(emomPlanKey(workoutId), '');
  void cancelEmomNotifications().catch(() => undefined);
}
