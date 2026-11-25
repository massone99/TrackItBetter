import { blockEnd, DEFAULT_TIMED_CUES, hasFinal, parseTimedPlan, repsOfRound, timedCue, timedHolds, timedKindFor, timedPhase, timedRounds, type TimedMethodPlan } from '../timedMethod';

const plan: TimedMethodPlan = {
  workoutId: 'w', entryId: 'e', startedAt: 0, countdownSec: 5, blockSec: 180, holdSec: 10, restSec: 10, recoverySec: 240, testSec: 30,
  recoveryEndedAt: null, testStartedAt: null, testEndedAt: null, blockSaved: false,
};
const at = (seconds: number) => seconds * 1000;

describe('timed method', () => {
  it('fits full hold + rest cycles in the block', () => {
    expect(timedRounds(plan)).toBe(9);
    expect(timedRounds({ ...plan, blockSec: 185 })).toBe(9);
    expect(timedHolds(plan, at(185), false).map((hold) => hold.seconds)).toEqual(Array(9).fill(10));
    expect(blockEnd(plan)).toBe(at(185));
  });

  it('walks countdown, hold, rest, recovery and ready', () => {
    expect(timedPhase(plan, at(1))).toEqual({ phase: 'countdown', secondsLeft: 4 });
    expect(timedPhase(plan, at(5))).toEqual({ phase: 'hold', round: 1, secondsLeft: 10 });
    expect(timedPhase(plan, at(14))).toEqual({ phase: 'hold', round: 1, secondsLeft: 1 });
    expect(timedPhase(plan, at(15))).toEqual({ phase: 'rest', round: 1, secondsLeft: 10 });
    expect(timedPhase(plan, at(25))).toEqual({ phase: 'hold', round: 2, secondsLeft: 10 });
    expect(timedPhase(plan, at(184))).toEqual({ phase: 'rest', round: 9, secondsLeft: 1 });
    expect(timedPhase(plan, at(185))).toEqual({ phase: 'recovery', secondsLeft: 240 });
    expect(timedPhase(plan, at(425))).toEqual({ phase: 'ready' });
  });

  it('lets the recovery be cut short and runs the final hold', () => {
    const skipped = { ...plan, recoveryEndedAt: at(200) };
    expect(timedPhase(skipped, at(199))).toEqual({ phase: 'recovery', secondsLeft: 1 });
    expect(timedPhase(skipped, at(200))).toEqual({ phase: 'ready' });
    const testing = { ...skipped, testStartedAt: at(210) };
    expect(timedPhase(testing, at(207))).toEqual({ phase: 'testCountdown', secondsLeft: 3 });
    expect(timedPhase(testing, at(240))).toEqual({ phase: 'test', seconds: 30 });
    expect(timedPhase({ ...testing, testEndedAt: at(236) }, at(300))).toEqual({ phase: 'done', seconds: 26 });
  });

  it('cues: go on a hold, tick on rest, ticks before a countdown ends, done when finished', () => {
    expect(timedCue({ phase: 'countdown', secondsLeft: 1 }, { phase: 'hold', round: 1, secondsLeft: 10 })).toBe('go');
    expect(timedCue({ phase: 'hold', round: 1, secondsLeft: 1 }, { phase: 'rest', round: 1, secondsLeft: 10 })).toBe('tick');
    expect(timedCue({ phase: 'rest', round: 1, secondsLeft: 1 }, { phase: 'hold', round: 2, secondsLeft: 10 })).toBe('go');
    expect(timedCue({ phase: 'countdown', secondsLeft: 4 }, { phase: 'countdown', secondsLeft: 3 })).toBe('tick');
    expect(timedCue({ phase: 'recovery', secondsLeft: 1 }, { phase: 'ready' })).toBe('done');
    expect(timedCue({ phase: 'test', seconds: 5 }, { phase: 'done', seconds: 6 })).toBe('done');
  });

  it('saves completed and partial holds without counting preparation or rest as work', () => {
    expect(timedHolds(plan, at(4), true)).toEqual([]);
    expect(timedHolds(plan, at(19), true)).toEqual([{ seconds: 10, completedAt: new Date(at(15)), restSec: 4 }]);
    expect(timedHolds(plan, at(28.7), true)).toEqual([
      { seconds: 10, completedAt: new Date(at(15)), restSec: 10 },
      { seconds: 3, completedAt: new Date(at(28.7)), restSec: 0 },
    ]);
  });

  it('keeps the actual final hold and respects a restored legacy block', () => {
    const testing = { ...plan, blockSaved: true, testStartedAt: at(210) };
    expect(timedHolds(testing, at(209), true)).toEqual([]);
    expect(timedHolds(testing, at(222.6), true)).toEqual([{ seconds: 12, completedAt: new Date(at(222.6)), restSec: null }]);
  });

  it('applies independent cue choices and warns only once per second', () => {
    const cues = { ...DEFAULT_TIMED_CUES, warningSec: 2, intervalWarnings: true, holdStart: false, restStart: false, milestones: false };
    const hold = { phase: 'hold', round: 1, secondsLeft: 10 } as const;
    const rest = { phase: 'rest', round: 1, secondsLeft: 10 } as const;
    expect(timedCue(null, hold, cues)).toBeNull();
    expect(timedCue(hold, rest, cues)).toBeNull();
    expect(timedCue(rest, { ...rest, secondsLeft: 2 }, cues)).toBe('tick');
    expect(timedCue(rest, rest, cues)).toBeNull();
    expect(timedCue({ phase: 'test', seconds: 29 }, { phase: 'test', seconds: 30 }, cues, 30)).toBeNull();
    expect(timedCue({ phase: 'test', seconds: 29 }, { phase: 'test', seconds: 30 }, DEFAULT_TIMED_CUES, 30)).toBe('done');
    expect(timedCue(hold, { ...hold, round: 2 })).toBe('go');
  });
});

describe('timed method on reps', () => {
  const reps: TimedMethodPlan = { ...plan, kind: 'reps', holdSec: 10, restSec: 0, blockSec: 60, testSec: 0, repsPerRound: 1, roundReps: {}, maxSet: false, maxReps: null };

  it('saves the planned reps of each interval, with corrections', () => {
    const corrected = { ...reps, roundReps: { 2: 0, 3: 2 } };
    expect(timedHolds(corrected, at(65), false).map((set) => set.reps)).toEqual([1, 0, 2, 1, 1, 1]);
    expect(timedHolds(corrected, at(65), false)[0]).toEqual({ seconds: 10, reps: 1, completedAt: new Date(at(15)), restSec: 0 });
  });

  it('ends with the block unless the max set is on', () => {
    expect(hasFinal(reps)).toBe(false);
    expect(timedPhase(reps, at(66))).toEqual({ phase: 'done', seconds: 0 });
    const withMax = { ...reps, maxSet: true };
    expect(hasFinal(withMax)).toBe(true);
    expect(timedPhase(withMax, at(66))).toEqual({ phase: 'recovery', secondsLeft: 239 });
  });

  it('saves the max set with the reps counted, never an empty one', () => {
    const testing = { ...reps, maxSet: true, testStartedAt: at(310), testEndedAt: at(340), maxReps: 12 };
    expect(timedHolds(testing, at(340), true).at(-1)).toEqual({ seconds: 30, reps: 12, completedAt: new Date(at(340)), restSec: null });
    expect(timedHolds({ ...testing, maxReps: 0 }, at(340), true)).toHaveLength(6);
  });

  it('runs rep exercises as reps and keeps older hold plans as they were', () => {
    expect(timedKindFor('reps_load')).toBe('reps');
    expect(timedKindFor('time')).toBe('hold');
    expect(parseTimedPlan(JSON.stringify(plan))?.kind).toBeUndefined();
    expect(parseTimedPlan(JSON.stringify({ ...reps, roundReps: { 1: 3, 2: -1 }, repsPerRound: 0 }))).toMatchObject({ kind: 'reps', repsPerRound: 1, roundReps: { 1: 3 }, testSec: 0 });
    expect(repsOfRound({ repsPerRound: 2, roundReps: { 4: 5 } }, 4)).toBe(5);
    expect(repsOfRound({ repsPerRound: 2, roundReps: { 4: 5 } }, 1)).toBe(2);
  });
});
