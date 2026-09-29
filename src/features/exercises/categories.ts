/** Every category an exercise can have, in the order the app offers them. */
export const EXERCISE_CATEGORIES = ['push', 'pull', 'biceps', 'triceps', 'legs', 'core', 'skill', 'mobility', 'cardio'] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];
