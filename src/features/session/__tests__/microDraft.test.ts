import { addDraftSet, doneItems, freshRound, newDraftExercise, removeDraftSet, stepDraftSet, updateDraftSet } from '../microDraft';

const pushUp = newDraftExercise({ id: 'push-up', name: 'Push-up', metric: 'reps' });
const hold = newDraftExercise({ id: 'l-sit', name: 'L-sit', metric: 'time' });

describe('micro-session draft', () => {
  it('starts each exercise with one easy set in its own unit', () => {
    expect(pushUp.sets).toMatchObject([{ index: 1, kind: 'working', reps: 3, durationSec: null }]);
    expect(hold.sets).toMatchObject([{ reps: null, durationSec: 10 }]);
  });

  it('adds sets like a workout: working sets copy the last one, warm-ups go first', () => {
    let draft = stepDraftSet([pushUp], pushUp.sets[0].id, 'reps', 2);
    draft = addDraftSet(draft, pushUp.entryId);
    draft = addDraftSet(draft, pushUp.entryId, 'warmup');
    expect(draft[0].sets.map((set) => [set.index, set.kind, set.reps])).toEqual([[1, 'warmup', 3], [2, 'working', 5], [3, 'working', 5]]);
    draft = removeDraftSet(draft, draft[0].sets[0].id);
    expect(draft[0].sets.map((set) => set.index)).toEqual([1, 2]);
  });

  it('logs only the done sets, and the next round starts from them', () => {
    let draft = addDraftSet([pushUp, hold], pushUp.entryId);
    draft = updateDraftSet(draft, draft[0].sets[1].id, { completedAt: new Date(), rpe: 7, formRating: 4, reps: 6 });
    expect(doneItems(draft)).toEqual([{ exerciseId: 'push-up', sets: [{ kind: 'working', value: 6, loadKg: 0, rpe: 7, formRating: 4 }] }]);
    const next = freshRound(draft);
    expect(next[0].sets).toMatchObject([{ reps: 6, completedAt: null, rpe: null }]);
    expect(next[1].sets).toHaveLength(1);
  });
});
