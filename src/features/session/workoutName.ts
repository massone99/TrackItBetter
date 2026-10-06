/** Names the app gives a workout started without one, in any language it has been used in. */
const DEFAULT_NAMES = new Set(['Workout', 'Allenamento']);

/**
 * The name to show: a workout left with the app's default name reads in the current language, so a
 * list started in English and continued in Italian does not mix "Workout" and "Allenamento".
 */
export function displayWorkoutName(name: string, defaultName: string): string {
  return DEFAULT_NAMES.has(name.trim()) ? defaultName : name;
}
