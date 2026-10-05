import { cachedUntilWrite } from '../cache';

jest.mock('../client', () => {
  const { createRealDatabase } = jest.requireActual('../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
const { mockReal: real } = jest.requireMock('../client');

describe('cachedUntilWrite', () => {
  beforeAll(() => { real.sqlite.exec('CREATE TABLE item (id INTEGER)'); });

  it('reuses the result until a row changes, then reloads', async () => {
    const load = jest.fn(async () => (real.sqlite.prepare('SELECT count(*) AS n FROM item').get() as { n: number }).n);
    const read = cachedUntilWrite(load);
    expect(await read()).toBe(0);
    expect(await read()).toBe(0);
    expect(load).toHaveBeenCalledTimes(1);
    real.sqlite.exec('INSERT INTO item VALUES (1)');
    expect(await read()).toBe(1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('retries after a failed load', async () => {
    const load = jest.fn().mockRejectedValueOnce(new Error('busy')).mockResolvedValue('ok');
    const read = cachedUntilWrite(load);
    await expect(read()).rejects.toThrow('busy');
    expect(await read()).toBe('ok');
  });
});
