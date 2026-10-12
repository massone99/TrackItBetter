import { groupRoutinesByProgram, programOfRoutine, type GroupProgram } from '../mobilityGroups';

const programs: GroupProgram[] = [
  { id: 'fb', name: 'Full Body', workoutNames: ['FB A', 'FB B'] },
  { id: 'ul', name: 'Upper / Lower', workoutNames: ['Upper', 'Lower', 'FB B'] },
];
const routine = (id: string, name: string, extra = {}) => ({ id, name, ...extra });

describe('programOfRoutine', () => {
  it('uses the stored program, keeping its saved name when the program is gone', () => {
    expect(programOfRoutine(routine('1', 'x', { programId: 'ul' }), programs)).toEqual({ id: 'ul', name: 'Upper / Lower' });
    expect(programOfRoutine(routine('1', 'x', { programId: 'gone', programName: 'Old plan' }), programs)).toEqual({ id: 'gone', name: 'Old plan' });
  });

  it('matches the name of a workout, ignoring case, only when exactly one program has it', () => {
    expect(programOfRoutine(routine('1', 'fb a'), programs)?.id).toBe('fb');
    expect(programOfRoutine(routine('2', 'FB B'), programs)).toBeNull();
    expect(programOfRoutine(routine('3', 'Morning hips'), programs)).toBeNull();
  });

  it('never matches a routine the user took out of programs', () => {
    expect(programOfRoutine(routine('1', 'FB A', { ungrouped: true }), programs)).toBeNull();
  });
});

describe('groupRoutinesByProgram', () => {
  it('groups in program order with the loose routines last, keeping routine order', () => {
    const groups = groupRoutinesByProgram([routine('1', 'Upper'), routine('2', 'Morning'), routine('3', 'FB A'), routine('4', 'Lower')], programs);
    expect(groups.map((group) => [group.name, group.routines.map((item) => item.id)])).toEqual([
      ['Full Body', ['3']], ['Upper / Lower', ['1', '4']], [null, ['2']],
    ]);
  });

  it('leaves out programs without routines and returns nothing for no routines', () => {
    expect(groupRoutinesByProgram([], programs)).toEqual([]);
    expect(groupRoutinesByProgram([routine('1', 'Lower')], programs).map((group) => group.programId)).toEqual(['ul']);
  });
});
