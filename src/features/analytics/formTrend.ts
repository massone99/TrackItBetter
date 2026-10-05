import { averageForm, type ComparableSet } from '../../domain/lastTime';
import { groupSets } from '../../domain/setPairs';

export interface FormSession {
  workoutId: string;
  workoutName: string;
  startedAt: Date;
  /** Average form of the session's rated working sets, 1–5. */
  average: number;
  /** Each rated set's form, in order (both sides of an L/R pair). */
  ratings: number[];
  /** Rated sets, an L/R pair counting once (as in the workout's set count). */
  ratedSets: number;
}

export type FormRow = ComparableSet & { workoutId: string; workoutName: string; startedAt: Date };

/** Sessions of one exercise with at least one rated set, oldest first, each with its average form. */
export function buildFormSessions(rows: readonly FormRow[]): FormSession[] {
  const byWorkout = new Map<string, FormRow[]>();
  for (const row of rows) {
    const list = byWorkout.get(row.workoutId);
    if (list) list.push(row);
    else byWorkout.set(row.workoutId, [row]);
  }
  return [...byWorkout.values()].flatMap((sets) => {
    const average = averageForm(sets);
    if (average === null) return [];
    return [{
      workoutId: sets[0].workoutId,
      workoutName: sets[0].workoutName,
      startedAt: sets[0].startedAt,
      average,
      ratings: sets.flatMap((set) => (set.formRating != null ? [set.formRating] : [])),
      ratedSets: groupSets(sets).filter((group) => group.some((set) => set.formRating != null)).length,
    }];
  }).sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
}
