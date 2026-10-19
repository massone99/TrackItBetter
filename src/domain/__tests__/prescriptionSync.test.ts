import { applyWorkoutToPrescription, findPrescribedWorkout, hasStructureChange, prescriptionChanges, trainedExercises } from '../prescriptionSync';
import type { UserProgram, UserProgramSession, WorkoutExerciseLike } from '../userProgram';

const set = (reps: number, over = {}) => ({ id: `s${reps}`, kind: 'working', side: 'both', pairId: null, reps, durationSec: null, distanceM: null, addedLoadKg: 0, restSec: 90, completedAt: new Date(), ...over });
const ex = (exerciseId: string, sets: ReturnType<typeof set>[]) => ({ exerciseId, metric: 'reps', notes: null, sets }) as unknown as WorkoutExerciseLike & { sets: ReturnType<typeof set>[] };
const session: UserProgramSession = {
  id: 'a', name: 'Push', exercises: [
    { id: 'p1', exerciseId: 'pushup', sets: 3, target: 10, restSeconds: 60, rpe: 8 },
    { id: 'p2', exerciseId: 'dip', sets: 3, target: 8 },
  ],
};
const program: UserProgram = { id: 'prog', name: 'PPL', sessions: [session], updatedAt: '2026-01-01' };
let n = 0;
const newId = () => `n${++n}`;

describe('prescription sync', () => {
  it('finds the prescribed workout by the workout name', () => {
    expect(findPrescribedWorkout([program], 'PPL · Push')?.session.id).toBe('a');
    expect(findPrescribedWorkout([program], 'Workout')).toBeNull();
  });

  it('sees no structure change when the workout matches', () => {
    const done = [ex('pushup', [set(10), set(10), set(10)]), ex('dip', [set(8), set(8), set(8)])];
    expect(hasStructureChange(prescriptionChanges(session, done))).toBe(false);
  });

  it('sees added, removed, reordered and set count changes', () => {
    const done = [ex('dip', [set(8), set(8)]), ex('pushup', [set(10), set(10), set(10)]), ex('row', [set(5)])];
    const changes = prescriptionChanges(session, done);
    expect(changes.added).toEqual(['row']);
    expect(changes.reordered).toBe(true);
    expect(changes.setsChanged).toEqual(['dip']);
    expect(prescriptionChanges(session, [ex('pushup', [set(10), set(10), set(10)])]).removed).toEqual(['dip']);
  });

  it('structure mode keeps what was planned, values mode takes what was done', () => {
    const done = [ex('pushup', [set(12), set(12)]), ex('row', [set(6)])];
    const structure = applyWorkoutToPrescription(session, done, 'structure', newId);
    expect(structure.exercises.map((e) => [e.exerciseId, e.sets])).toEqual([['pushup', 2], ['row', 1]]);
    expect(structure.exercises[0]).toMatchObject({ id: 'p1', target: 10, restSeconds: 60, rpe: 8 });
    const values = applyWorkoutToPrescription(session, done, 'values', newId);
    expect(values.exercises[0]).toMatchObject({ id: 'p1', target: 12, sets: 2 });
    expect(values.name).toBe('Push');
  });

  it('drops exercises with no completed set', () => {
    const skipped = ex('dip', [set(8, { completedAt: null })]);
    expect(trainedExercises([ex('pushup', [set(10)]), skipped]).map((e) => e.exerciseId)).toEqual(['pushup']);
  });
});
