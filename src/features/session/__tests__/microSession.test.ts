import { pickRecent } from '../microSession';

jest.mock('../../../db/client', () => ({ db: {}, initializeDatabase: jest.fn() }));

describe('pickRecent', () => {
  const exercises = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];

  it('keeps recency order, drops duplicates and unknown (archived) ids, and limits', () => {
    expect(pickRecent(['b', 'gone', 'b', 'a', 'c'], exercises, 2).map((item) => item.id)).toEqual(['b', 'a']);
  });
});
