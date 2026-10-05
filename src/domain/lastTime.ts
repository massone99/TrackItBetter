import { groupSets } from './setPairs';

/** What the comparison needs from a set, current or from last time. */
export interface ComparableSet {
  pairId?: string | null;
  side?: string;
  kind?: string;
  completedAt?: Date | null;
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
  restSec?: number | null;
  formRating?: number | null;
}

/** This session against last time; `now` is null until there is something to compare (no set done, no rating). */
export interface Pairing { now: number | null; last: number }

export interface LastTimeComparison {
  /** Reps (seconds for holds, metres for distance) summed over the working sets. */
  total: Pairing | null;
  /** Average rest set on the working sets, in seconds. */
  rest: Pairing | null;
  /** Average form rating of the sets, 1–5. */
  form: Pairing | null;
  /** The mini PRs: more in total, less rest, better form. */
  improved: { total: boolean; rest: boolean; form: boolean };
  /** Regressions worth flagging. Only form: total and rest fill up during the workout, so "less so far" is not one. */
  worse: { form: boolean };
}

const amountOf = (set: ComparableSet, metric: string) =>
  metric === 'time' || metric === 'time_load' ? set.durationSec : metric === 'distance' ? set.distanceM : set.reps;

/** One value per working set; an L/R pair counts once, as the mean of its sides (like the statistics). */
function perSet(sets: readonly ComparableSet[], value: (set: ComparableSet) => number | null | undefined): number[] {
  return groupSets(sets.filter((set) => set.kind !== 'warmup')).flatMap((group) => {
    const values = group.map(value).filter((item): item is number => item != null && Number.isFinite(item));
    return values.length ? [values.reduce((sum, item) => sum + item, 0) / values.length] : [];
  });
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const mean = (values: number[]) => (values.length ? sum(values) / values.length : null);

/**
 * How this session of an exercise compares with the last one. Form is the average rating of the sets. "Now" counts only completed sets, so it
 * fills up during the workout; total passes last time once it is beaten. A set without a rest of its
 * own uses `defaultRest` (the rest the app applies to it).
 */
export function compareWithLast(
  current: readonly ComparableSet[],
  previous: readonly ComparableSet[] | null,
  metric: string,
  options: { defaultRest: number },
): LastTimeComparison {
  const done = current.filter((set) => set.completedAt);
  const restOf = (set: ComparableSet) => set.restSec ?? options.defaultRest;
  const totalNow = perSet(done, (set) => amountOf(set, metric));
  const totalLast = previous ? perSet(previous, (set) => amountOf(set, metric)) : [];
  const total = previous && totalLast.length ? { now: round(sum(totalNow)), last: round(sum(totalLast)) } : null;
  const restNow = mean(perSet(done, restOf));
  const restLast = previous ? mean(perSet(previous, restOf)) : null;
  // A comparison exists as soon as last time has a value, so the strip keeps its shape while sets get done.
  const rest = restLast !== null ? { now: restNow === null ? null : Math.round(restNow), last: Math.round(restLast) } : null;
  const formNow = mean(perSet(done, (set) => set.formRating));
  const formLast = previous ? mean(perSet(previous, (set) => set.formRating)) : null;
  const form = formLast !== null ? { now: formNow === null ? null : round(formNow), last: round(formLast) } : null;
  return {
    total,
    rest,
    form,
    improved: {
      total: total !== null && total.now !== null && total.now > total.last,
      rest: rest !== null && rest.now !== null && rest.now < rest.last,
      form: form !== null && form.now !== null && form.now > form.last,
    },
    worse: { form: form !== null && form.now !== null && form.now < form.last },
  };
}

const round = (value: number) => Math.round(value * 10) / 10;

/** Average form of a session's rated working sets (an L/R pair counts once), to 0.1; null when none is rated. */
export function averageForm(sets: readonly ComparableSet[]): number | null {
  const value = mean(perSet(sets, (set) => set.formRating));
  return value === null ? null : round(value);
}
