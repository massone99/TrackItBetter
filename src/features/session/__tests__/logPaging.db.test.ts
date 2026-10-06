import { migrateDatabase } from '../../../db/migrations';
import { listWorkoutsBetween, listWorkoutsPage, listWorkoutStarts } from '../repository';

jest.mock('../../../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../../../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
const { mockReal: real } = jest.requireMock('../../../db/client');

const DAY = 24 * 60 * 60 * 1000;
const start = new Date(2020, 0, 1, 10).getTime();

beforeAll(async () => {
  await migrateDatabase(real.expo);
  // 400 finished workouts, one a day, plus two at the same instant and one still open.
  const insert = real.sqlite.prepare('INSERT INTO workout (id, name, started_at, ended_at) VALUES (?, ?, ?, ?)');
  for (let day = 0; day < 400; day += 1) insert.run(`w${String(day).padStart(3, '0')}`, `Day ${day}`, start + day * DAY, start + day * DAY + 3_600_000);
  insert.run('twin-a', 'Twin', start + 500 * DAY, start + 500 * DAY + 60_000);
  insert.run('twin-b', 'Twin', start + 500 * DAY, start + 500 * DAY + 60_000);
  insert.run('open', 'Open', start + 600 * DAY, null);
});

describe('Log paging', () => {
  it('walks every finished workout page by page, newest first, without skipping equal start times', async () => {
    const seen: string[] = [];
    let page = await listWorkoutsPage(30);
    while (page.length > 0) {
      seen.push(...page.map((workout) => workout.id));
      const last = page[page.length - 1];
      page = await listWorkoutsPage(30, { startedAt: last.startedAt, id: last.id });
    }
    expect(seen).toHaveLength(402);
    expect(new Set(seen).size).toBe(402);
    expect(seen.slice(0, 3)).toEqual(['twin-b', 'twin-a', 'w399']);
    expect(seen[seen.length - 1]).toBe('w000');
  });

  it('finds workouts older than a year for a day and for the calendar', async () => {
    const day = new Date(2020, 0, 2);
    const next = new Date(2020, 0, 3);
    expect((await listWorkoutsBetween(day, next)).map((workout) => workout.id)).toEqual(['w001']);
    expect(await listWorkoutStarts(new Date(2020, 0, 1), new Date(2020, 0, 8))).toHaveLength(7);
  });
});
