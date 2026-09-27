import { estimateRoutineSeconds, expandRoutine, type MobilityStep } from '../mobilityPlan';

const step = (overrides: Partial<MobilityStep>): MobilityStep => ({
  id: 's', exerciseId: 'pike-stretch', mode: 'hold', seconds: 30, reps: 10, perSide: false, rounds: 1, restSec: 0, ...overrides,
});

describe('expandRoutine', () => {
  it('alternates sides with a switch and rests between rounds', () => {
    const segments = expandRoutine({ transitionSec: 0, steps: [step({ perSide: true, rounds: 2, restSec: 20 })] });
    expect(segments.map((segment) => segment.kind === 'work' ? `work:${segment.side}:${segment.round}` : segment.kind)).toEqual([
      'work:left:1', 'switch', 'work:right:1', 'rest', 'work:left:2', 'switch', 'work:right:2',
    ]);
  });

  it('adds transitions between drills pointing at the next one', () => {
    const segments = expandRoutine({ transitionSec: 10, steps: [step({ id: 'a' }), step({ id: 'b', mode: 'reps' })] });
    expect(segments).toEqual([
      { kind: 'work', stepIndex: 0, round: 1, side: null, mode: 'hold', durationSec: 30, reps: null },
      { kind: 'transition', stepIndex: 1, durationSec: 10 },
      { kind: 'work', stepIndex: 1, round: 1, side: null, mode: 'reps', durationSec: null, reps: 10 },
    ]);
  });

  it('estimates duration including reps at 3 s each', () => {
    expect(estimateRoutineSeconds({ transitionSec: 10, steps: [step({}), step({ mode: 'reps', reps: 10 })] })).toBe(30 + 10 + 30);
  });

  it('treats invalid rounds as one round', () => {
    expect(expandRoutine({ transitionSec: 0, steps: [step({ rounds: 0 })] })).toHaveLength(1);
  });
});
