import { readPreference, writePreference } from '../../shared/settings/preferences';

export type SetKind = 'working' | 'warmup';

const FALLBACK: Record<SetKind, number> = { working: 90, warmup: 60 };
const defaultKey = (kind: SetKind) => `rest.default.${kind}`;
const exerciseKey = (exerciseId: string, kind: SetKind) => `rest.exercise.${exerciseId}.${kind}`;

function readSeconds(key: string): number | null {
  const value = Number(readPreference(key));
  return Number.isInteger(value) && value >= 0 && value <= 3600 && readPreference(key) !== null ? value : null;
}

export function readDefaultRest(kind: SetKind): number {
  return readSeconds(defaultKey(kind)) ?? FALLBACK[kind];
}

export function writeDefaultRest(kind: SetKind, seconds: number): void {
  writePreference(defaultKey(kind), String(seconds));
}

/** Rest after a set of this kind for the exercise: its own setting, else the global default. */
export function readExerciseRest(exerciseId: string, kind: SetKind): number {
  return readSeconds(exerciseKey(exerciseId, kind)) ?? readDefaultRest(kind);
}

export function writeExerciseRest(exerciseId: string, kind: SetKind, seconds: number): void {
  writePreference(exerciseKey(exerciseId, kind), String(seconds));
}

/** A rest stored on the set (e.g. from a program) wins over the exercise setting. */
export function restForSet(exerciseId: string, set: { kind: SetKind; restSec: number | null }): number {
  return set.restSec ?? readExerciseRest(exerciseId, set.kind);
}
