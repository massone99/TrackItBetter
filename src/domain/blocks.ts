/** Parts of a workout, in the order they are done. An exercise without a block belongs to the main work. */
export const BLOCKS = ['warmup', 'main', 'mobility'] as const;
export type Block = (typeof BLOCKS)[number];

export function blockOf(value: string | null | undefined): Block {
  return (BLOCKS as readonly string[]).includes(value ?? '') ? (value as Block) : 'main';
}

export const blockRank = (value: string | null | undefined): number => BLOCKS.indexOf(blockOf(value));

/** Entries grouped by block, in block order; entries of one block keep their own order. */
export function sortByBlock<T extends { order: number; block: string | null }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => blockRank(a.block) - blockRank(b.block) || a.order - b.order);
}

/** True once any exercise sits outside the main work: only then are the sections worth showing. */
export function usesBlocks(entries: readonly { block: string | null }[]): boolean {
  return entries.some((entry) => blockOf(entry.block) !== 'main');
}

/**
 * The block an exercise takes after being moved to `toIndex` of the new order: that of the exercise now
 * above it, or of the one below when it became first. Blocks stay contiguous because the order was sorted.
 */
export function blockAfterMove(reordered: readonly { block: string | null }[], toIndex: number): Block {
  const neighbour = toIndex > 0 ? reordered[toIndex - 1] : reordered[toIndex + 1];
  return neighbour ? blockOf(neighbour.block) : 'main';
}
