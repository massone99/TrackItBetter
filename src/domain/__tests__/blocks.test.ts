import { blockAfterMove, blockOf, sortByBlock, usesBlocks } from '../blocks';

const entry = (order: number, block: string | null) => ({ order, block });

describe('blocks', () => {
  it('treats a missing or unknown block as the main work', () => {
    expect(blockOf(null)).toBe('main');
    expect(blockOf('nope')).toBe('main');
    expect(blockOf('mobility')).toBe('mobility');
    expect(usesBlocks([entry(1, null), entry(2, 'main')])).toBe(false);
    expect(usesBlocks([entry(1, null), entry(2, 'warmup')])).toBe(true);
  });

  it('sorts by block and keeps the order inside each block', () => {
    const sorted = sortByBlock([entry(1, 'mobility'), entry(2, null), entry(3, 'warmup'), entry(4, 'main'), entry(5, 'warmup')]);
    expect(sorted.map((item) => item.order)).toEqual([3, 5, 2, 4, 1]);
  });

  it('gives a moved exercise the block of its new neighbour above, or below when first', () => {
    const order = [entry(1, 'warmup'), entry(2, 'warmup'), entry(3, null), entry(4, 'mobility')];
    expect(blockAfterMove(order, 2)).toBe('warmup');
    expect(blockAfterMove(order, 3)).toBe('main');
    expect(blockAfterMove(order, 0)).toBe('warmup');
    expect(blockAfterMove([entry(1, null)], 0)).toBe('main');
  });
});
