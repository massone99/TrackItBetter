import { expandScopes, RESET_SCOPES } from '../resetScopes';

describe('expandScopes', () => {
  it('clears only what was picked', () => {
    expect([...expandScopes(['workouts', 'pose'])].sort()).toEqual(['pose', 'workouts']);
    expect(expandScopes([]).size).toBe(0);
  });

  it('treats everything as every scope', () => {
    expect([...expandScopes(['everything'])].sort()).toEqual([...RESET_SCOPES].sort());
  });
});
