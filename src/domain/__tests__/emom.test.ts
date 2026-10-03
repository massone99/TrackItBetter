import { emomCue, emomLabel, emomPhase, parseEmomPlan, roundEndsAt, roundsDue, type EmomPlan } from '../emom';

const plan: EmomPlan = { workoutId: 'w', entryId: 'e', startedAt: 0, countdownSec: 5, intervalSec: 60, rounds: 3, target: 5, value: 5, field: 'reps' };

describe('emom', () => {
  it('counts down, then runs rounds of one interval each', () => {
    expect(emomPhase(plan, 0)).toEqual({ phase: 'countdown', secondsLeft: 5 });
    expect(emomPhase(plan, 5_000)).toEqual({ phase: 'running', round: 1, secondsLeft: 60 });
    expect(emomPhase(plan, 64_500)).toEqual({ phase: 'running', round: 1, secondsLeft: 1 });
    expect(emomPhase(plan, 65_000)).toEqual({ phase: 'running', round: 2, secondsLeft: 60 });
    expect(emomPhase(plan, 185_000)).toEqual({ phase: 'done' });
  });

  it('reports rounds due after a long absence, capped at the plan', () => {
    expect(roundsDue(plan, 4_000)).toBe(0);
    expect(roundsDue(plan, 125_000)).toBe(2);
    expect(roundsDue(plan, 10_000_000)).toBe(3);
    expect(roundEndsAt(plan, 2)).toBe(125_000);
  });

  it('cues the last seconds, each new round and the end once', () => {
    expect(emomCue({ phase: 'running', round: 1, secondsLeft: 4 }, { phase: 'running', round: 1, secondsLeft: 3 })).toBe('tick');
    expect(emomCue({ phase: 'running', round: 1, secondsLeft: 3 }, { phase: 'running', round: 1, secondsLeft: 3 })).toBeNull();
    expect(emomCue({ phase: 'running', round: 1, secondsLeft: 1 }, { phase: 'running', round: 2, secondsLeft: 60 })).toBe('go');
    expect(emomCue({ phase: 'countdown', secondsLeft: 1 }, { phase: 'running', round: 1, secondsLeft: 60 })).toBe('go');
    expect(emomCue({ phase: 'running', round: 3, secondsLeft: 1 }, { phase: 'done' })).toBe('done');
    expect(emomCue({ phase: 'done' }, { phase: 'done' })).toBeNull();
  });

  it('labels and parses plans', () => {
    expect(emomLabel({ rounds: 10, intervalSec: 60 })).toBe('EMOM 10 × 1′');
    expect(emomLabel({ rounds: 8, intervalSec: 30 })).toBe('EMOM 8 × 30″');
    expect(emomLabel({ rounds: 6, intervalSec: 90 })).toBe('EMOM 6 × 1′30″');
    expect(parseEmomPlan(JSON.stringify(plan))).toEqual(plan);
    expect(parseEmomPlan('{"rounds":0}')).toBeNull();
    expect(parseEmomPlan('nope')).toBeNull();
    expect(parseEmomPlan(null)).toBeNull();
  });
});
