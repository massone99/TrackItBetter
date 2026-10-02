/**
 * Which exercise cards of a workout are folded after the workout was (re)loaded.
 * - `completed`: entry id → every set done; `known`: that map as it was at the previous load;
 * - `current`: what is folded now; `initial`: this is the first load of the screen.
 *
 * Every exercise starts folded when the workout is opened. One added later starts open (it is about to
 * be logged). Manual folding is kept, while finishing an exercise folds it and reopening a set unfolds it.
 */
export function nextFolded(
  completed: ReadonlyMap<string, boolean>,
  known: ReadonlyMap<string, boolean>,
  current: ReadonlyMap<string, boolean>,
  initial: boolean,
): Map<string, boolean> {
  return new Map([...completed].map(([entryId, allDone]) => {
    if (!known.has(entryId)) return [entryId, initial || allDone] as const;
    return [entryId, known.get(entryId) !== allDone ? allDone : current.get(entryId) ?? allDone] as const;
  }));
}
