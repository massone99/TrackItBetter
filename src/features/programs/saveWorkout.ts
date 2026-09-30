import * as Crypto from 'expo-crypto';
import { sessionFromWorkout, type UserProgram, type WorkoutExerciseLike } from '../../domain/userProgram';
import { addSessionToProgram, saveUserProgram } from './userPrograms';

export type SaveTarget = { kind: 'new'; programName: string } | { kind: 'existing'; programId: string };

/**
 * Saves a workout (finished, or still being built) as a workout of a program: a brand-new program
 * made around it, or an existing one it is added to. Returns the program it landed in.
 */
export async function saveWorkoutToProgram(input: { target: SaveTarget; workoutName: string; exercises: readonly WorkoutExerciseLike[] }): Promise<UserProgram> {
  const session = sessionFromWorkout(input.workoutName, input.exercises, () => Crypto.randomUUID());
  if (input.target.kind === 'new') return saveUserProgram({ name: input.target.programName, sessions: [session] });
  const updated = await addSessionToProgram(input.target.programId, session);
  if (!updated) throw new Error('Program not found');
  return updated;
}
