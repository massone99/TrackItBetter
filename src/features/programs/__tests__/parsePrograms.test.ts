import { parsePrograms } from '../userPrograms';

jest.mock('../../../db/client', () => ({ db: {}, initializeDatabase: jest.fn() }));

const exercise = { id: 'e', exerciseId: 'push-up', sets: 3, target: 8, restSeconds: 90 };

describe('parsePrograms', () => {
  it('orders sessions of programs saved with weekdays Monday first and drops the weekday', () => {
    const [program] = parsePrograms([{
      id: 'p', name: 'Plan', updatedAt: 'x',
      sessions: [
        { id: 'sun', weekday: 0, name: 'Sun', exercises: [exercise] },
        { id: 'wed', weekday: 3, name: 'Wed', exercises: [exercise] },
        { id: 'mon', weekday: 1, name: 'Mon', exercises: [exercise] },
      ],
    }]);
    expect(program.sessions.map((session) => session.id)).toEqual(['mon', 'wed', 'sun']);
    expect(program.sessions[0]).not.toHaveProperty('weekday');
  });

  it('keeps the stored order of programs without weekdays', () => {
    const [program] = parsePrograms([{
      id: 'p', name: 'Plan', updatedAt: 'x',
      sessions: [{ id: 'b', name: 'B', exercises: [exercise] }, { id: 'a', name: 'A', exercises: [exercise] }],
    }]);
    expect(program.sessions.map((session) => session.id)).toEqual(['b', 'a']);
  });

  it('keeps movements saved without a rest', () => {
    const { restSeconds: _rest, ...noRest } = exercise;
    const [program] = parsePrograms([{ id: 'p', name: 'Plan', updatedAt: 'x', sessions: [{ id: 's', name: 'A', exercises: [noRest, { ...exercise, id: 'e2', restSeconds: null }] }] }]);
    expect(program.sessions[0].exercises).toHaveLength(2);
  });
});
