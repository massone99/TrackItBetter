import { buildProgressSnapshot, type CompletedSetRow } from '../summary';

const now = new Date(2026, 8, 29, 12);
const day = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000);
let counter = 0;
const row = (over: Partial<CompletedSetRow>): CompletedSetRow => ({
  workoutId: 'w1', workoutStartedAt: day(1), bodyweightKg: 70, exerciseId: 'x', exerciseName: 'X', category: 'push', extraCategories: '[]',
  movementPattern: null, movementGroup: null, metric: 'reps', leverageFactor: null, setId: `s${counter += 1}`, reps: 5, durationSec: null,
  distanceM: null, addedLoadKg: 0, completedAt: day(1), rpe: null, ...over,
});
const hold = { metric: 'time', reps: null, durationSec: 15 };

describe('weekly push and pull balance', () => {
  it('counts holds by their category, main or extra', () => {
    const { weeklyBalance } = buildProgressSnapshot([
      row({ ...hold, category: 'skill', extraCategories: '["push"]', movementGroup: 'horizontal-push' }),
      row({ ...hold, category: 'skill', extraCategories: '["pull"]', movementGroup: 'horizontal-pull' }),
    ], now);
    expect(weeklyBalance).toMatchObject({ pushSets: 1, pullSets: 1, totalSets: 2 });
  });

  it('uses the movement group when there is no pattern, and the pattern when there is no group', () => {
    const { weeklyBalance } = buildProgressSnapshot([
      row({ movementGroup: 'horizontal-push' }),
      row({ ...hold, category: 'skill', movementPattern: 'inversion', movementGroup: 'vertical-push' }),
      row({ movementPattern: 'vertical-pull' }),
      row({ movementPattern: 'horizontal-pull', category: 'pull' }),
    ], now);
    expect(weeklyBalance).toMatchObject({ horizontalPushSets: 1, verticalPushSets: 1, verticalPullSets: 1, horizontalPullSets: 1 });
  });

  it('counts legs when it is an extra category, unless the exercise is mobility work', () => {
    const { weeklyBalance } = buildProgressSnapshot([
      row({ category: 'core', extraCategories: '["legs"]' }),
      row({ category: 'mobility', extraCategories: '[]', movementPattern: 'hip-extension' }),
      row({ category: 'skill', extraCategories: '["legs","mobility"]', movementPattern: 'hip-extension' }),
    ], now);
    expect(weeklyBalance.legSets).toBe(2);
  });
});

