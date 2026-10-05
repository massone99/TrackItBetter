import { buildFormSessions, type FormRow } from '../formTrend';

const row = (workoutId: string, day: number, formRating: number | null, extra: Partial<FormRow> = {}): FormRow => ({
  workoutId, workoutName: workoutId, startedAt: new Date(2026, 9, day), reps: 8, durationSec: null, distanceM: null, completedAt: new Date(), kind: 'working', formRating, ...extra,
});

describe('buildFormSessions', () => {
  it('averages each session, oldest first, skipping sessions without ratings', () => {
    const sessions = buildFormSessions([row('b', 5, 4), row('b', 5, 5), row('a', 1, 3), row('c', 3, null)]);
    expect(sessions.map((session) => [session.workoutId, session.average, session.ratings])).toEqual([['a', 3, [3]], ['b', 4.5, [4, 5]]]);
  });

  it('counts an L/R pair once', () => {
    const sessions = buildFormSessions([row('a', 1, 2, { pairId: 'p', side: 'left' }), row('a', 1, 4, { pairId: 'p', side: 'right' }), row('a', 1, 5)]);
    expect(sessions[0].average).toBe(4);
    expect(sessions[0].ratedSets).toBe(2);
  });
});
