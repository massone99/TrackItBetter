import { blockEnd, DEFAULT_TIMED_CUES, hasFinal, parseTimedCues, parseTimedPlan, repsOfRound, timedCue, timedHolds, timedKindFor, timedPhase, timedRounds, timedSoundCue, type TimedMethodPlan } from '../timedMethod';

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

  it('resolves custom beep tones, halfway cues and periodic pace ticks', () => {
    const custom = parseTimedCues({
      warningSec: 2,
      intervalWarnings: true,
      warningTone: 'sharp',
      holdStartTone: 'bell',
      restStartTone: 'double',
      milestoneTone: 'done',
      halfwayTone: 'soft',
      intervalTickSec: 5,
      intervalTickTone: 'tick',
      volume: 0.75,
      vibrate: false,
    });
    expect(custom.volume).toBe(0.75);
    expect(custom.vibrate).toBe(false);
    // Start of hold -> custom bell; start of rest -> custom double
    expect(timedSoundCue({ phase: 'countdown', secondsLeft: 1 }, { phase: 'hold', round: 1, secondsLeft: 20 }, custom, { holdSec: 20 })).toBe('bell');
    expect(timedSoundCue({ phase: 'hold', round: 1, secondsLeft: 1 }, { phase: 'rest', round: 1, secondsLeft: 10 }, custom, { holdSec: 20 })).toBe('double');
    // Periodic pace tick at 5s elapsed (secondsLeft 16 -> 15 on 20s hold)
    expect(timedSoundCue({ phase: 'hold', round: 1, secondsLeft: 16 }, { phase: 'hold', round: 1, secondsLeft: 15 }, custom, { holdSec: 20 })).toBe('tick');
    // Halfway wins over pace tick at 10s elapsed (secondsLeft 11 -> 10 on 20s hold)
    expect(timedSoundCue({ phase: 'hold', round: 1, secondsLeft: 11 }, { phase: 'hold', round: 1, secondsLeft: 10 }, custom, { holdSec: 20 })).toBe('soft');
    // Warning wins in last 2s
    expect(timedSoundCue({ phase: 'hold', round: 1, secondsLeft: 3 }, { phase: 'hold', round: 1, secondsLeft: 2 }, custom, { holdSec: 20 })).toBe('sharp');
    // Halfway and pace tick in final test hold (goal 30s)
    expect(timedSoundCue({ phase: 'test', seconds: 4 }, { phase: 'test', seconds: 5 }, custom, { testSec: 30 })).toBe('tick');
    expect(timedSoundCue({ phase: 'test', seconds: 14 }, { phase: 'test', seconds: 15 }, custom, { testSec: 30 })).toBe('soft');
    expect(timedSoundCue({ phase: 'test', seconds: 29 }, { phase: 'test', seconds: 30 }, custom, { testSec: 30 })).toBe('done');
    // Silent tone produces null
    const silent = parseTimedCues({ holdStartTone: 'none', restStartTone: 'none', warningTone: 'none' });
    expect(timedSoundCue({ phase: 'countdown', secondsLeft: 1 }, { phase: 'hold', round: 1, secondsLeft: 10 }, silent, { holdSec: 10 })).toBeNull();
  });

  it('defaults to last-3s warning beeps on both holds and rests and lets each be customized independently', () => {
    const defaults = parseTimedCues(undefined);
    expect(defaults.holdWarningSec).toBe(3);
    expect(defaults.restWarningSec).toBe(3);
    // Last 3s of hold
    expect(timedSoundCue({ phase: 'hold', round: 1, secondsLeft: 4 }, { phase: 'hold', round: 1, secondsLeft: 3 }, defaults, { holdSec: 10 })).toBe('tick');
    expect(timedSoundCue({ phase: 'hold', round: 1, secondsLeft: 5 }, { phase: 'hold', round: 1, secondsLeft: 4 }, defaults, { holdSec: 10 })).toBeNull();
    // Last 3s of rest
    expect(timedSoundCue({ phase: 'rest', round: 1, secondsLeft: 4 }, { phase: 'rest', round: 1, secondsLeft: 3 }, defaults, { holdSec: 10 })).toBe('tick');
    expect(timedSoundCue({ phase: 'rest', round: 1, secondsLeft: 5 }, { phase: 'rest', round: 1, secondsLeft: 4 }, defaults, { holdSec: 10 })).toBeNull();
    // Independent customization: hold 0 (off), rest 5s
    const customWarn = parseTimedCues({ holdWarningSec: 0, restWarningSec: 5, warningTone: 'sharp' });
    expect(timedSoundCue({ phase: 'hold', round: 1, secondsLeft: 2 }, { phase: 'hold', round: 1, secondsLeft: 1 }, customWarn, { holdSec: 10 })).toBeNull();
    expect(timedSoundCue({ phase: 'rest', round: 1, secondsLeft: 6 }, { phase: 'rest', round: 1, secondsLeft: 5 }, customWarn, { holdSec: 10 })).toBe('sharp');
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

  it('manualRest reps plans never start rest until the user confirms the round', () => {
    const manual: TimedMethodPlan = { ...reps, blockSec: 20, holdSec: 10, restSec: 0, manualRest: true, roundConfirmedAt: {} };
    // Even 100s into round 1, still awaiting confirmation (rest does NOT start automatically)
    expect(timedPhase(manual, at(105))).toEqual({ phase: 'hold', round: 1, secondsLeft: 0, elapsedSec: 100, awaitingConfirm: true });
    expect(timedHolds(manual, at(105), true)).toEqual([]);

    // User confirms round 1 at t=20s -> 10s rest runs until t=30s
    const afterR1: TimedMethodPlan = { ...manual, roundConfirmedAt: { 1: at(20) } };
    expect(timedPhase(afterR1, at(20))).toEqual({ phase: 'rest', round: 1, secondsLeft: 10 });
    expect(timedPhase(afterR1, at(27))).toEqual({ phase: 'rest', round: 1, secondsLeft: 3 });
    // At t=30s, round 2 begins and waits for confirmation again
    expect(timedPhase(afterR1, at(30))).toEqual({ phase: 'hold', round: 2, secondsLeft: 0, elapsedSec: 0, awaitingConfirm: true });
    expect(timedPhase(afterR1, at(90))).toEqual({ phase: 'hold', round: 2, secondsLeft: 0, elapsedSec: 60, awaitingConfirm: true });

    // Confirming final round ends block cleanly and records both sets
    const afterR2: TimedMethodPlan = { ...afterR1, roundConfirmedAt: { 1: at(20), 2: at(42) } };
    expect(timedPhase(afterR2, at(42))).toEqual({ phase: 'done', seconds: 0 });
    expect(timedHolds(afterR2, at(42), true).map((s) => ({ reps: s.reps, restSec: s.restSec }))).toEqual([
      { reps: 1, restSec: 10 },
      { reps: 1, restSec: 0 },
    ]);
  });
});
