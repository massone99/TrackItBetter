/**
 * Development only (Expo web): `window.__seed(workouts)` fills an empty database with programs and
 * finished workouts, so screenshots and timings run against realistic data.
 */
import * as Crypto from 'expo-crypto';
import { listExercises } from '../features/exercises/repository';
import { listUserPrograms, saveUserProgram } from '../features/programs/userPrograms';
import { startUserProgramSession } from '../features/programs/startUserSession';
import { programSessionWorkoutName } from '../domain/userProgram';
import { addExerciseToWorkout, getCompletedWorkout, logCompletedWorkout, setSetFormRating, startWorkout } from '../features/session/repository';

async function seed(count = 40, active = false, from = 0, total = count): Promise<void> {
  const library = (await listExercises()).filter((exercise) => exercise.metric === 'reps');
  const pick = (start: number) => library.slice(start, start + 5);
  const program = (name: string, sessions: string[]) => saveUserProgram({
    name,
    sessions: sessions.map((session, index) => ({
      id: Crypto.randomUUID(),
      name: session,
      // Targets: one RPE for the first workout, set by set for the second.
      exercises: pick(index * 5).map((exercise) => ({ id: Crypto.randomUUID(), exerciseId: exercise.id, sets: 4, target: 8, ...(index === 0 ? { rpe: 8 } : index === 1 ? { rpePerSet: [7, 8, 8.5, 9] } : {}) })),
    })),
  });
  if (from === 0) {
    await program('Push Pull Legs', ['Push', 'Pull', 'Legs']);
    await program('Skills', ['Planche day', 'Front lever day']);
  }
  const names = ['Push', 'Pull', 'Legs'].map((name) => programSessionWorkoutName({ name: 'Push Pull Legs' }, { name }));
  const now = Date.now();
  for (let index = from; index < from + count; index += 1) {
    const startedAt = new Date(now - (total - index) * 2 * 86_400_000 + 3_600_000);
    const loggedId = await logCompletedWorkout({
      name: names[index % names.length],
      startedAt,
      endedAt: new Date(startedAt.getTime() + 3_000_000),
      entries: pick((index % 3) * 5).map((exercise, order) => ({
        exerciseId: exercise.id,
        sets: Array.from({ length: 4 }, (_, set) => ({ reps: 6 + Math.floor(index / 4) + (set % 2), completedAt: new Date(startedAt.getTime() + (order * 4 + set) * 120_000) })),
      })),
    });
    // Every set rated 3 for form, so today's ratings have something to compare with.
    for (const entry of (await getCompletedWorkout(loggedId))?.exercises ?? []) {
      for (const set of entry.sets) await setSetFormRating(set.id, 3);
    }
  }
  if (active) {
    // The active workout starts from the program, so it carries the RPE targets.
    const ppl = (await listUserPrograms()).find((item) => item.name === 'Push Pull Legs');
    const workoutId = ppl ? await startUserProgramSession(ppl, ppl.sessions[0]) : await startWorkout(names[0]);
    const weighted = (await listExercises()).find((exercise) => exercise.metric === 'reps_load');
    if (weighted) await addExerciseToWorkout(workoutId, weighted.id);
    const hold = (await listExercises()).find((exercise) => exercise.metric === 'time');
    if (hold) await addExerciseToWorkout(workoutId, hold.id);
  }
}

(globalThis as { __seed?: typeof seed }).__seed = seed;

/** Times `fn` over `runs` calls and returns the median in ms. */
async function time(fn: () => Promise<unknown>, runs = 5): Promise<number> {
  const samples: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  return samples.sort((a, b) => a - b)[Math.floor(runs / 2)];
}
(globalThis as { __time?: typeof time }).__time = time;

/** The data loads behind the main screens, for `__time(__loads.today)`. */
(globalThis as { __loads?: unknown }).__loads = {
  today: async () => {
    const { getMobilityWeek, getProgressSnapshot } = await import('../features/analytics/repository');
    const { getGoalSnapshot } = await import('../features/goals/repository');
    const { getActiveWorkout, listRecentWorkoutNames, listRecentWorkouts } = await import('../features/session/repository');
    const { listUserPrograms } = await import('../features/programs/userPrograms');
    return Promise.all([getActiveWorkout(), getGoalSnapshot(), getProgressSnapshot(), listRecentWorkouts(1), getMobilityWeek(), listUserPrograms(), listRecentWorkoutNames()]);
  },
  log: async () => (await import('../features/session/repository')).listRecentWorkouts(),
};
