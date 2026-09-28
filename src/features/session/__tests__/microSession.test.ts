import { defaultMicroTarget, pickRecent } from '../microSession';

jest.mock('../../../db/client', () => ({ db: {}, initializeDatabase: jest.fn() }));

describe('pickRecent', () => {
  const exercises = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];

  it('keeps recency order, drops duplicates and unknown (archived) ids, and limits', () => {
    expect(pickRecent(['b', 'gone', 'b', 'a', 'c'], exercises, 2).map((item) => item.id)).toEqual(['b', 'a']);
  });
});

describe('defaultMicroTarget', () => {
  it('is 10 for timed and distance metrics', () => {
    expect(defaultMicroTarget('time')).toBe('10');
    expect(defaultMicroTarget('time_load')).toBe('10');
    expect(defaultMicroTarget('distance')).toBe('10');
  });

  it('is 3 for other metrics (e.g. reps)', () => {
    expect(defaultMicroTarget('reps')).toBe('3');
    expect(defaultMicroTarget('unknown')).toBe('3');
  });
});
