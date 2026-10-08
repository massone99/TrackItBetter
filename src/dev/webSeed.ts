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
    // Form ratings that drift upwards, so the form trend and today's comparison have something to show.
    for (const entry of (await getCompletedWorkout(loggedId))?.exercises ?? []) {
      for (const set of entry.sets) await setSetFormRating(set.id, [2, 3, 3, 4, 4, 5][Math.floor(index / 3) % 6]);
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

/**
 * Development only: pull-up sessions at different added loads and with help from bands, to look at
 * the load comparison. `__seedLoads()` once, on an empty database.
 */
async function seedLoads(many = false): Promise<void> {
  const { db } = await import('../db/client');
  const { trainingSets } = await import('../db/schema');
  const { inArray } = await import('drizzle-orm');
  const { saveBandSet, newBand } = await import('../features/equipment/repository');
  const set = await saveBandSet({ name: 'Decathlon', bands: [{ ...newBand('Blu', '#2F80ED'), minKg: 15, maxKg: 35 }, { ...newBand('Verde', '#27AE60'), minKg: 5, maxKg: 15 }] });
  const [blue, green] = set.bands;
  const day = 86_400_000;
  const now = Date.now();
  // [days ago, reps per set, added load, band (blue|green|none), tension]
  const plan: [number, number[], number, 'blue' | 'green' | null, 1 | 2 | 3][] = [
    [40, [4, 3, 3], 0, 'blue', 3], [33, [5, 4, 4], 0, 'blue', 3], [26, [6, 5, 5], 0, 'blue', 2],
    [19, [4, 4, 3], 0, 'green', 3], [12, [6, 5, 4], 0, 'green', 2], [5, [7, 6, 5], 0, 'green', 1],
    [30, [3, 3, 2], 0, null, 1], [14, [4, 3, 3], 0, null, 1], [3, [5, 4, 3], 0, null, 1],
    [21, [3, 3, 3], 10, null, 1], [8, [4, 3, 3], 10, null, 1], [2, [3, 3, 3], 15, null, 1],
  ];
  // `many`: one session at every 2.5 kg from 2.5 to 60, to see a ladder of 25+ loads.
  if (many) for (let step = 1; step <= 24; step += 1) plan.push([step + 1, [Math.max(1, 9 - Math.floor(step / 4)), 3, 3], step * 2.5, null, 1]);
  for (const [ago, reps, load, band, tension] of plan) {
    const startedAt = new Date(now - ago * day);
    const id = await logCompletedWorkout({
      name: 'Pull day', startedAt, endedAt: new Date(startedAt.getTime() + 2_400_000),
      entries: [{ exerciseId: 'pull-up', sets: reps.map((value, index) => ({ reps: value, completedAt: new Date(startedAt.getTime() + index * 120_000) })) }],
    });
    const completed = await getCompletedWorkout(id);
    const ids = completed?.exercises[0].sets.map((item) => item.id) ?? [];
    if (ids.length === 0) continue;
    await db.update(trainingSets).set({ rpe: 8 }).where(inArray(trainingSets.id, ids));
    if (load !== 0) await db.update(trainingSets).set({ addedLoadKg: load }).where(inArray(trainingSets.id, ids));
    if (band) {
      const picked = band === 'blue' ? blue : green;
      const assist = band === 'blue' ? (tension === 1 ? 15 : tension === 2 ? 25 : 35) : (tension === 1 ? 5 : tension === 2 ? 10 : 15);
      await db.update(trainingSets).set({ bands: JSON.stringify([{ bandId: picked.id, tension }]), assistKg: assist }).where(inArray(trainingSets.id, ids));
    }
  }
}
(globalThis as { __seedLoads?: typeof seedLoads }).__seedLoads = seedLoads;

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
