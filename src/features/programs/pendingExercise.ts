/** An exercise just created for a program workout, waiting for the program builder to add it. */
export interface PendingProgramExercise { sessionId: string; exerciseId: string; metric: string }

let pending: PendingProgramExercise | null = null;

export function setPendingExercise(value: PendingProgramExercise): void {
  pending = value;
}

/** Returns the waiting exercise and clears it, so a later visit to the builder does not add it again. */
export function takePendingExercise(): PendingProgramExercise | null {
  const value = pending;
  pending = null;
  return value;
}
