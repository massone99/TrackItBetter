/** Active: moved with your own strength. Passive: taken into position by gravity, load or a partner. */
export const MOBILITY_MODES = ['active', 'passive'] as const;
export type MobilityMode = (typeof MOBILITY_MODES)[number];

/** The mode to keep: only meaningful while mobility is the main or an extra category. */
export function mobilityModeFor(
  exercise: { category: string; extraCategories?: readonly string[] | null },
  mode: string | null | undefined,
): MobilityMode | null {
  const isMobility = exercise.category === 'mobility' || (exercise.extraCategories ?? []).includes('mobility');
  return isMobility && (MOBILITY_MODES as readonly string[]).includes(mode ?? '') ? mode as MobilityMode : null;
}
