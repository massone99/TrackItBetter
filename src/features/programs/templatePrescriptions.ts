import type { UserProgramExercise } from '../../domain/userProgram';
import type { ProgramExercise } from './catalog';

/** A built-in program's exercises as the prescriptions a workout is started from. */
export function prescriptionsFromTemplate(sessionId: string, exercises: readonly ProgramExercise[]): UserProgramExercise[] {
  return exercises.map((exercise, index) => ({
    id: `${sessionId}-${index}`,
    exerciseId: exercise.exerciseId,
    sets: exercise.sets,
    target: exercise.target.seconds ?? exercise.target.reps ?? null,
    restSeconds: exercise.restSeconds,
  }));
}
