import { adjustedRest, REST_STEP_SEC } from '../restTimer';

describe('adjustedRest', () => {
  const now = 1_000_000;
  it('adds and takes off a step from the time left', () => {
    expect(adjustedRest(now + 60_000, now, REST_STEP_SEC)).toBe(75);
    expect(adjustedRest(now + 60_000, now, -REST_STEP_SEC)).toBe(45);
    expect(adjustedRest(now + 59_200, now, -REST_STEP_SEC)).toBe(45);
  });
  it('ends the rest when nothing would be left', () => {
    expect(adjustedRest(now + 15_000, now, -REST_STEP_SEC)).toBeNull();
    expect(adjustedRest(now + 4_000, now, -REST_STEP_SEC)).toBeNull();
  });
});
