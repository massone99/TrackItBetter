/** Every category an exercise can have, in the order the app offers them. */
export const EXERCISE_CATEGORIES = ['push', 'pull', 'biceps', 'triceps', 'legs', 'core', 'skill', 'mobility', 'cardio'] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

/** True when mobility is the exercise's category or one of its extra categories. */
export function isMobilityExercise(exercise: { category: string; extraCategories: string }): boolean {
  return exercise.category === 'mobility' || exercise.extraCategories.includes('"mobility"');
}
