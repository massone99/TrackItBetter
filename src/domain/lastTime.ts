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
  addedLoadKg?: number;
  restSec?: number | null;
  formRating?: number | null;
  rpe?: number | null;
  /** Bands on the set; with `assistKg` null they are bands whose kg are unknown. */
  bands?: readonly unknown[];
  assistKg?: number | null;
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
  /** Average RPE of the sets; only when every set has one (last time; and today, for `now`). */
  rpe: Pairing | null;
  /** Average band assistance in kg (a set without bands counts 0); null when no set used bands. */
  assist: Pairing | null;
  /** Some set used a band whose kg are unknown, so assistance cannot be compared. */
  assistUnknown: boolean;
  /**
   * The mini PRs: more in total, less rest, better form, and the same work at a lower average RPE
   * (every set done with the same reps or time and load as last time, rest no longer, form no worse).
   */
  improved: { total: boolean; rest: boolean; form: boolean; rpe: boolean; assist: boolean };
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

/** The mean of one value per working set, or null unless every working set has it. */
function fullMean(sets: readonly ComparableSet[], value: (set: ComparableSet) => number | null | undefined): number | null {
  const groups = groupSets(sets.filter((set) => set.kind !== 'warmup'));
  if (groups.length === 0 || groups.some((group) => group.some((set) => value(set) == null))) return null;
  return mean(perSet(sets, value));
}

const sameValues = (a: number[], b: number[]) => a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 1e-6);

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
  const rpeLast = previous ? fullMean(previous, (set) => set.rpe) : null;
  const rpeNow = done.length ? fullMean(done, (set) => set.rpe) : null;
  const rpe = rpeLast !== null ? { now: rpeNow === null ? null : round(rpeNow), last: round(rpeLast) } : null;
  const banded = (set: ComparableSet) => (set.bands?.length ?? 0) > 0;
  const assistOf = (set: ComparableSet) => (banded(set) ? set.assistKg ?? null : 0);
  const workingLast = (previous ?? []).filter((set) => set.kind !== 'warmup');
  const anyBands = done.some(banded) || workingLast.some(banded);
  const assistUnknown = anyBands && [...done, ...workingLast].some((set) => set.kind !== 'warmup' && banded(set) && set.assistKg == null);
  const assistLast = previous && anyBands && !assistUnknown ? mean(perSet(previous, assistOf)) : null;
  const assistNow = anyBands && !assistUnknown ? mean(perSet(done, assistOf)) : null;
  const assist = assistLast !== null ? { now: assistNow === null ? null : round(assistNow), last: round(assistLast) } : null;
  const working = current.filter((set) => set.kind !== 'warmup');
  const sameWork = previous !== null && working.length > 0 && working.every((set) => set.completedAt)
    && sameValues(perSet(done, (set) => amountOf(set, metric)), totalLast)
    && sameValues(perSet(done, (set) => set.addedLoadKg ?? 0), perSet(previous, (set) => set.addedLoadKg ?? 0))
    && !assistUnknown && sameValues(perSet(done, (set) => assistOf(set) ?? 0), perSet(previous, (set) => assistOf(set) ?? 0));
  const improvedRest = rest !== null && rest.now !== null && rest.now < rest.last;
  const improvedForm = form !== null && form.now !== null && form.now > form.last;
  const worseForm = form !== null && form.now !== null && form.now < form.last;
  return {
    total,
    rest,
    form,
    rpe,
    assist,
    assistUnknown,
    improved: {
      total: total !== null && total.now !== null && total.now > total.last,
      rest: improvedRest,
      form: improvedForm,
      // Less help from the bands for the work done is progress; it fills up like the total.
      assist: assist !== null && assist.now !== null && assist.now < assist.last && working.every((set) => set.completedAt),
      rpe: sameWork && rpe !== null && rpe.now !== null && rpe.now < rpe.last
        && (rest === null || rest.now === null || rest.now <= rest.last) && !worseForm,
    },
    worse: { form: worseForm },
  };
}

const round = (value: number) => Math.round(value * 10) / 10;
