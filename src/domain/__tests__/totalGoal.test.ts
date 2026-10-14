import { nextSetValue, totalProgress } from '../totalGoal';

const set = (reps: number, done = true, extra: object = {}) => ({ kind: 'working', reps, durationSec: null, distanceM: null, completedAt: done ? new Date() : null, ...extra });

describe('totalProgress', () => {
  it('sums completed working sets only', () => {
    const progress = totalProgress([set(12), set(11), set(9), set(9, false), set(5, true, { kind: 'warmup' })], 'reps', 50);
    expect(progress).toMatchObject({ done: 32, remaining: 18, reached: false, over: 0 });
    expect(progress.fraction).toBeCloseTo(0.64);
  });
  it('reports a goal reached and how far past it', () => {
    expect(totalProgress([set(30), set(22)], 'reps', 50)).toMatchObject({ done: 52, remaining: 0, reached: true, over: 2, fraction: 1 });
  });
  it('counts seconds for holds', () => {
    const hold = (seconds: number) => ({ kind: 'working', reps: null, durationSec: seconds, distanceM: null, completedAt: new Date() });
    expect(totalProgress([hold(40), hold(35)], 'time', 120)).toMatchObject({ done: 75, remaining: 45 });
  });
});

describe('nextSetValue', () => {
  it('repeats the last set but never goes past what is left', () => {
    expect(nextSetValue(10, 18)).toBe(10);
    expect(nextSetValue(10, 6)).toBe(6);
    expect(nextSetValue(null, 7)).toBe(7);
    expect(nextSetValue(0, 0)).toBe(1);
  });
});
