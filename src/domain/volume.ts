export interface VolumeSet {
  /** Total effective load in kg, including bodyweight where applicable. */
  effectiveLoadKg?: number;
  reps?: number;
  durationSec?: number;
}

export interface VolumeSummary {
  reps: number;
  durationSec: number;
  /** Sum of effectiveLoadKg × reps, in kg-reps. */
  loadReps: number;
  /** Sum of effectiveLoadKg × durationSec, in kg-seconds. */
  loadSeconds: number;
}

/** Summarize rep and hold work without conflating their different units. */
export function calculateVolume(sets: readonly VolumeSet[]): VolumeSummary {
  return sets.reduce<VolumeSummary>((total, set) => {
    const reps = set.reps ?? 0;
    const durationSec = set.durationSec ?? 0;
    const loadKg = set.effectiveLoadKg ?? 0;
    assertNonNegativeFinite(reps, 'reps');
    assertNonNegativeFinite(durationSec, 'durationSec');
    assertNonNegativeFinite(loadKg, 'effectiveLoadKg');
    return {
      reps: total.reps + reps,
      durationSec: total.durationSec + durationSec,
      loadReps: total.loadReps + loadKg * reps,
      loadSeconds: total.loadSeconds + loadKg * durationSec,
    };
  }, { reps: 0, durationSec: 0, loadReps: 0, loadSeconds: 0 });
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number`);
  }
}
