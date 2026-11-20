import { blockEnd, DEFAULT_TIMED_CUES, timedCue, timedHolds, timedPhase, timedRounds, type TimedMethodPlan } from '../timedMethod';

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
