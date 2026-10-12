import { prescriptionsFromTemplate } from '../templatePrescriptions';

describe('prescriptionsFromTemplate', () => {
  it('maps a template day to prescriptions, preferring the hold seconds over reps', () => {
    expect(prescriptionsFromTemplate('upper-a', [
      { exerciseId: 'pull-up', sets: 3, target: { reps: 5 }, restSeconds: 90 },
      { exerciseId: 'hollow-body-hold', sets: 3, target: { seconds: 20 }, restSeconds: 60 },
      { exerciseId: 'open', sets: 1, target: {}, restSeconds: 45 },
    ])).toEqual([
      { id: 'upper-a-0', exerciseId: 'pull-up', sets: 3, target: 5, restSeconds: 90 },
      { id: 'upper-a-1', exerciseId: 'hollow-body-hold', sets: 3, target: 20, restSeconds: 60 },
      { id: 'upper-a-2', exerciseId: 'open', sets: 1, target: null, restSeconds: 45 },
    ]);
  });
});
