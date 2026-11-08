import { BLOCKS, blockOf, type Block } from '../../../domain/blocks';
import { isLoadMetric, isTimedMetric, type UserProgramExercise, type UserProgramSession } from '../../../domain/userProgram';
import { rpeTargetText } from '../describe';
import { formatClock } from '../../../shared/utils/format';

/** The exercises of one block, in their order. */
export function inBlock(exercises: readonly UserProgramExercise[], block: Block): UserProgramExercise[] {
  return exercises.filter((exercise) => blockOf(exercise.block) === block);
}

/** Blocks in doing order (warm-up, main, mobility); each keeps its own order. Main stores no block. */
export function normalizeBlocks(exercises: readonly UserProgramExercise[]): UserProgramExercise[] {
  return BLOCKS.flatMap((block) => inBlock(exercises, block));
}

/** Moves one exercise inside its block (`from` and `to` are positions in that block). */
export function moveInBlock(exercises: readonly UserProgramExercise[], block: Block, from: number, to: number): UserProgramExercise[] {
  const list = inBlock(exercises, block);
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return normalizeBlocks(exercises);
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  return BLOCKS.flatMap((candidate) => (candidate === block ? list : inBlock(exercises, candidate)));
}

/** Puts an exercise at the end of another block. */
export function setBlock(exercises: readonly UserProgramExercise[], id: string, block: Block): UserProgramExercise[] {
  const next = exercises.map((exercise) => (exercise.id === id ? { ...exercise, block: block === 'main' ? null : block } : exercise));
  const moved = next.find((exercise) => exercise.id === id);
  if (!moved) return normalizeBlocks(exercises);
  return normalizeBlocks([...next.filter((exercise) => exercise.id !== id), moved]);
}

/** A copy right after the original, in the same block. */
export function duplicateExercise(exercises: readonly UserProgramExercise[], id: string, newId: () => string): UserProgramExercise[] {
  const index = exercises.findIndex((exercise) => exercise.id === id);
  if (index < 0) return [...exercises];
  const copy = { ...exercises[index], id: newId(), ...(exercises[index].rpePerSet ? { rpePerSet: [...exercises[index].rpePerSet!] } : {}) };
  return normalizeBlocks([...exercises.slice(0, index + 1), copy, ...exercises.slice(index + 1)]);
}

/** Sets that are not warm-up. */
export function workingSetCount(session: Pick<UserProgramSession, 'exercises'>): number {
  return session.exercises.reduce((sum, exercise) => sum + (blockOf(exercise.block) === 'warmup' ? 0 : exercise.sets), 0);
}

/** The prescription in one mono line: "4 × 6 @8 · 2:00 · 20 kg · total 50". */
export function prescriptionLine(prescription: UserProgramExercise, metric: string | undefined): string {
  const unit = isTimedMetric(metric) ? ' s' : metric === 'distance' ? ' m' : '';
  const rpe = rpeTargetText(prescription);
  const parts: string[] = [];
  if (prescription.totalTarget != null) {
    parts.push(`Σ ${isTimedMetric(metric) ? formatClock(prescription.totalTarget) : `${prescription.totalTarget}${unit}`}`);
  } else {
    const head = `${prescription.sets} × ${prescription.target === null ? '–' : `${prescription.target}${unit}`}`;
    parts.push(rpe ? `${head} @${rpe}` : head);
  }
  if (prescription.totalTarget != null && rpe) parts[0] = `${parts[0]} @${rpe}`;
  if (isLoadMetric(metric) && prescription.loadKg != null) parts.push(`${prescription.loadKg} kg`);
  if (prescription.restSeconds != null && prescription.restSeconds > 0) parts.push(formatClock(prescription.restSeconds));
  return parts.join(' · ');
}
