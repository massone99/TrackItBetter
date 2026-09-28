import { holdCue, holdPhase, recordedSeconds, startHold, type HoldPhase } from '../holdTimer';

describe('hold timer', () => {
  it('counts down five seconds before the hold starts', () => {
    const timer = startHold(0, 'free', 30);
    expect(holdPhase(timer, 0)).toEqual({ phase: 'countdown', secondsLeft: 5 });
    expect(holdPhase(timer, 4_100)).toEqual({ phase: 'countdown', secondsLeft: 1 });
    expect(holdPhase(timer, 5_000)).toEqual({ phase: 'running', elapsed: 0, remaining: null });
  });

  it('counts up without end in free mode', () => {
    const timer = startHold(0, 'free', 30);
    expect(holdPhase(timer, 5_000 + 95_400)).toEqual({ phase: 'running', elapsed: 95, remaining: null });
  });

  it('counts down and finishes on its own in target mode', () => {
    const timer = startHold(0, 'target', 20);
    expect(holdPhase(timer, 5_000 + 12_000)).toEqual({ phase: 'running', elapsed: 12, remaining: 8 });
    expect(holdPhase(timer, 5_000 + 25_000)).toEqual({ phase: 'done', elapsed: 20 });
  });

  it('records nothing when stopped during the countdown', () => {
    const timer = startHold(0, 'free', 10);
    expect(recordedSeconds(holdPhase(timer, 2_000))).toBe(0);
    expect(recordedSeconds(holdPhase(timer, 5_000 + 7_900))).toBe(7);
  });

  it('beeps each countdown second, on start, in the last three seconds and at the end', () => {
    const timer = startHold(0, 'target', 5);
    const cues: string[] = [];
    let previous: HoldPhase | null = null;
    for (let now = 0; now <= 11_000; now += 250) {
      const current = holdPhase(timer, now);
      const cue = holdCue(previous, current);
      if (cue) cues.push(cue);
      previous = current;
    }
    expect(cues).toEqual(['tick', 'tick', 'tick', 'tick', 'tick', 'go', 'tick', 'tick', 'tick', 'done']);
  });
});
