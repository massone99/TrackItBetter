export interface GroupableRoutine {
  id: string;
  name: string;
  programId?: string;
  programName?: string;
  ungrouped?: boolean;
}

/** A program (own or built-in) and the names of its workouts, to match routines made from them. */
export interface GroupProgram {
  id: string;
  name: string;
  workoutNames: readonly string[];
}

export interface RoutineGroup<T> {
  /** null for the routines that belong to no program. */
  programId: string | null;
  name: string | null;
  routines: T[];
}

const norm = (value: string) => value.trim().toLocaleLowerCase();

/** The program a routine was made from: its stored one, else the only program with a workout of the same name. */
export function programOfRoutine(routine: GroupableRoutine, programs: readonly GroupProgram[]): { id: string; name: string } | null {
  if (routine.programId) {
    const known = programs.find((program) => program.id === routine.programId);
    return { id: routine.programId, name: known?.name ?? routine.programName ?? routine.programId };
  }
  if (routine.ungrouped) return null;
  const matches = programs.filter((program) => program.workoutNames.some((workout) => norm(workout) === norm(routine.name)));
  // A name shared by several programs says nothing about where the routine came from.
  return matches.length === 1 ? { id: matches[0].id, name: matches[0].name } : null;
}

/**
 * Routines grouped by program, in the order the programs are given (the caller sorts them by use);
 * programs without routines are left out, and the routines of no program come last. The order of the
 * routines inside a group is kept.
 */
export function groupRoutinesByProgram<T extends GroupableRoutine>(routines: readonly T[], programs: readonly GroupProgram[]): RoutineGroup<T>[] {
  const byProgram = new Map<string, RoutineGroup<T>>();
  const loose: T[] = [];
  for (const routine of routines) {
    const program = programOfRoutine(routine, programs);
    if (!program) { loose.push(routine); continue; }
    const group = byProgram.get(program.id) ?? { programId: program.id, name: program.name, routines: [] };
    group.routines.push(routine);
    byProgram.set(program.id, group);
  }
  const rank = (id: string) => { const index = programs.findIndex((program) => program.id === id); return index < 0 ? programs.length : index; };
  const groups = [...byProgram.values()].sort((a, b) => rank(a.programId!) - rank(b.programId!) || a.name!.localeCompare(b.name!));
  return loose.length > 0 ? [...groups, { programId: null, name: null, routines: loose }] : groups;
}
