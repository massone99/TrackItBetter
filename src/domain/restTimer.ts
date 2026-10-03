/** How much one tap adds to or takes off a running rest. */
export const REST_STEP_SEC = 15;

/**
 * Seconds left on a rest whose end moves by `deltaSec`, or null when that leaves nothing, i.e. the rest is over.
 */
export function adjustedRest(endsAt: number, now: number, deltaSec: number): number | null {
  const remaining = Math.ceil((endsAt + deltaSec * 1000 - now) / 1000);
  return remaining > 0 ? remaining : null;
}
