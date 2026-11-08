import type { UserProgramExercise } from '../../../../domain/userProgram';
import { duplicateExercise, inBlock, moveInBlock, prescriptionLine, setBlock, workingSetCount } from '../workoutOps';

const ex = (id: string, block: UserProgramExercise['block'] = null, sets = 3): UserProgramExercise => ({ id, exerciseId: id, sets, target: 8, block });
const ids = (list: readonly UserProgramExercise[]) => list.map((item) => item.id);

describe('workoutOps', () => {
  it('moves inside a block without touching the others', () => {
    const list = [ex('w', 'warmup'), ex('a'), ex('b'), ex('c'), ex('m', 'mobility')];
    expect(ids(moveInBlock(list, 'main', 0, 2))).toEqual(['w', 'b', 'c', 'a', 'm']);
  });

  it('puts an exercise at the end of another block and stores no block for main', () => {
    const list = [ex('a'), ex('b')];
    const moved = setBlock(list, 'a', 'warmup');
    expect(ids(moved)).toEqual(['a', 'b']);
    expect(inBlock(moved, 'warmup').map((item) => item.id)).toEqual(['a']);
    expect(setBlock(moved, 'a', 'main').find((item) => item.id === 'a')?.block).toBeNull();
  });

  it('duplicates right after the original with a new id', () => {
    const copy = duplicateExercise([ex('a'), ex('b')], 'a', () => 'a2');
    expect(ids(copy)).toEqual(['a', 'a2', 'b']);
  });

  it('counts working sets without warm-up', () => {
    expect(workingSetCount({ exercises: [ex('w', 'warmup', 2), ex('a', null, 4)] })).toBe(4);
  });

  it('writes the prescription in one line', () => {
    expect(prescriptionLine({ ...ex('a'), sets: 4, target: 6, rpe: 8, restSeconds: 120, loadKg: 20 }, 'reps_load')).toBe('4 × 6 @8 · 20 kg · 2:00');
    expect(prescriptionLine({ ...ex('a'), target: null }, 'reps')).toBe('3 × –');
    expect(prescriptionLine({ ...ex('a'), totalTarget: 50 }, 'reps')).toBe('Σ 50');
  });
});
