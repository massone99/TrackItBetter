/**
 * Workouts whose prescribed workout the user has already dealt with by saving the workout to a
 * program (as new, or replacing the original): finishing them must not offer to update the
 * original again. Kept for the life of the app; if the app is closed first, the offer can come
 * back at the end, and it is only a sheet that can be declined.
 */
const handled = new Set<string>();

export function markPrescriptionHandled(workoutId: string): void {
  handled.add(workoutId);
}

export function isPrescriptionHandled(workoutId: string): boolean {
  return handled.has(workoutId);
}
