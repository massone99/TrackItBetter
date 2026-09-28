/**
 * What a reset can clear. `everything` also restores the bundled movement catalog, removing custom
 * movements and edits to built-in ones; appearance and language stay as they are.
 */
export type ResetScope = 'workouts' | 'body' | 'pose' | 'plans' | 'everything';

export const RESET_SCOPES: ResetScope[] = ['workouts', 'body', 'pose', 'plans', 'everything'];

/** Scopes a set of choices actually clears: `everything` covers all the others. */
export function expandScopes(scopes: readonly ResetScope[]): Set<ResetScope> {
  return scopes.includes('everything') ? new Set(RESET_SCOPES) : new Set(scopes);
}
