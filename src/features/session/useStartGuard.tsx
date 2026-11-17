import { useCallback, useState } from 'react';
import { WorkoutInProgressSheet } from './WorkoutInProgressSheet';

type Active = { id: string; name: string };

/**
 * For screens that start a workout: when one is already open, `block(active, retry)` shows the
 * sheet (resume it, or discard it and carry on with `retry`). Render `sheet` once in the screen.
 */
export function useStartGuard() {
  const [blocked, setBlocked] = useState<{ active: Active; retry: (() => void) | null } | null>(null);
  const block = useCallback((active: Active, retry?: () => void) => setBlocked({ active, retry: retry ?? null }), []);
  const sheet = (
    <WorkoutInProgressSheet
      active={blocked?.active ?? null}
      onClose={() => setBlocked(null)}
      onDiscarded={blocked?.retry ?? undefined}
    />
  );
  return { block, sheet };
}
