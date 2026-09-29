import { setPendingExercise, takePendingExercise } from '../pendingExercise';

describe('pending exercise', () => {
  it('hands the exercise created for a program to the builder exactly once', () => {
    expect(takePendingExercise()).toBeNull();
    setPendingExercise({ sessionId: 's1', exerciseId: 'ex', metric: 'time' });
    expect(takePendingExercise()).toEqual({ sessionId: 's1', exerciseId: 'ex', metric: 'time' });
    expect(takePendingExercise()).toBeNull();
  });
});
