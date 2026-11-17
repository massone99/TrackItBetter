import * as Crypto from 'expo-crypto';
import { applyWorkoutToPrescription } from '../../domain/prescriptionSync';
import { sessionFromWorkout, type UserProgram, type WorkoutExerciseLike } from '../../domain/userProgram';
import { addSessionToProgram, getUserProgram, saveUserProgram } from './userPrograms';

export type SaveTarget =
  | { kind: 'new'; programName: string }
  | { kind: 'existing'; programId: string }
  /** Takes the workout into an existing prescribed workout, which it replaces in place. Only ever chosen explicitly. */
  | { kind: 'replace'; programId: string; sessionId: string };

/**
 * Saves a workout (finished, or still being built) as a workout of a program: a brand-new program
 * made around it, an existing one it is added to, or, only when asked, an existing prescribed
 * workout updated with it. Returns the program it landed in.
 */
export async function saveWorkoutToProgram(input: { target: SaveTarget; workoutName: string; exercises: readonly WorkoutExerciseLike[] }): Promise<UserProgram> {
  const { target } = input;
  if (target.kind === 'replace') {
    const program = await getUserProgram(target.programId);
    const current = program?.sessions.find((session) => session.id === target.sessionId);
    if (!program || !current) throw new Error('Prescribed workout not found');
    const updated = applyWorkoutToPrescription(current, input.exercises, 'values', () => Crypto.randomUUID());
    // Everything else about the program (layout, groups, clusters…) stays as it is.
    return saveUserProgram({ ...program, sessions: program.sessions.map((session) => (session.id === updated.id ? updated : session)) });
  }
  const session = sessionFromWorkout(input.workoutName, input.exercises, () => Crypto.randomUUID());
  if (target.kind === 'new') return saveUserProgram({ name: target.programName, sessions: [session] });
  const updated = await addSessionToProgram(target.programId, session);
  if (!updated) throw new Error('Program not found');
  return updated;
}
