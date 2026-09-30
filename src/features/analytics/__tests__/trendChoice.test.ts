import { selectTrends } from '../trendChoice';
import type { ExerciseTrend } from '../summary';

const trend = (exerciseId: string, kind: ExerciseTrend['kind'] = 'reps'): ExerciseTrend => ({ exerciseId, exerciseName: exerciseId, kind, points: [] });
const trends = [trend('a'), trend('a', 'added_load'), trend('b'), trend('c')];

describe('selectTrends', () => {
  it('shows the most recent ones up to the limit when automatic', () => {
    expect(selectTrends(trends, { exerciseIds: null, limit: 2 }).map((slot) => slot.trend?.kind)).toEqual(['reps', 'added_load']);
  });

  it('follows the chosen order, one per exercise, and keeps room for ones without data', () => {
    const slots = selectTrends(trends, { exerciseIds: ['c', 'x', 'a', 'b'], limit: 3 });
    expect(slots.map((slot) => [slot.exerciseId, slot.trend?.kind ?? null])).toEqual([['c', 'reps'], ['x', null], ['a', 'reps']]);
  });
});
