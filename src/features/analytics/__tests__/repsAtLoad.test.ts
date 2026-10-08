import { repsAtLoadFromHistory } from '../repsAtLoad';
import type { ExerciseHistorySession } from '../repository';

const set = (id: string, reps: number, overrides: Partial<ExerciseHistorySession['sets'][number]> = {}) => ({
  id, kind: 'working', reps, durationSec: null, distanceM: null, addedLoadKg: 0, rpe: null, ...overrides,
});
const session = (workoutId: string, day: number, sets: ExerciseHistorySession['sets']): ExerciseHistorySession =>
  ({ workoutId, workoutName: workoutId, startedAt: new Date(2026, 9, day), notes: null, sets });

describe('repsAtLoadFromHistory', () => {
  it('groups by net load: added weight minus the help from bands, apart from plain bodyweight', () => {
    const groups = repsAtLoadFromHistory([
      session('a', 1, [set('1', 4), set('2', 4, { bandCount: 1, assistKg: 20 })]),
      session('b', 8, [set('3', 5, { bandCount: 2, assistKg: 20 }), set('4', 6, { addedLoadKg: 10 })]),
      // Bands of unknown kg cannot be placed on the ladder.
      session('c', 15, [set('5', 9, { bandCount: 1, assistKg: null })]),
    ]);
    expect(groups.map((group) => group.loadKg).sort((a, b) => b - a)).toEqual([10, 0, -20]);
    const helped = groups.find((group) => group.loadKg === -20)!;
    expect(helped.sessions.map((item) => item.bestReps)).toEqual([4, 5]);
    // Added weight and help cancel: +10 kg with 10 kg of help is bodyweight.
    const cancel = repsAtLoadFromHistory([session('d', 20, [set('6', 7, { addedLoadKg: 10, bandCount: 1, assistKg: 10 })]), session('e', 22, [set('7', 8)])]);
    expect(cancel).toHaveLength(1);
    expect(cancel[0].sessions.map((item) => item.bestReps)).toEqual([7, 8]);
  });
});
