import { act, renderHook } from '@testing-library/react-native';
import { usePaged, usePagedSections } from '../paging';

jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));

const items = Array.from({ length: 25 }, (_, index) => index);

describe('usePaged', () => {
  it('shows a page at a time and resets when the key changes', () => {
    const { result, rerender } = renderHook(({ key }: { key: string }) => usePaged(items, 10, key), { initialProps: { key: 'a' } });
    expect(result.current.shown).toHaveLength(10);
    expect(result.current.remaining).toBe(15);
    act(() => result.current.more());
    act(() => result.current.more());
    expect(result.current.shown).toHaveLength(25);
    expect(result.current.remaining).toBe(0);
    rerender({ key: 'b' });
    expect(result.current.shown).toHaveLength(10);
  });

  it('cuts grouped lists by items, keeping each group full size for its header', () => {
    const sections = [{ id: 'a', items: [1, 2, 3] }, { id: 'b', items: [4, 5, 6, 7] }];
    const { result } = renderHook(() => usePagedSections(sections, 5));
    expect(result.current.shown.map((section) => [section.id, section.items.length, section.total])).toEqual([['a', 3, 3], ['b', 2, 4]]);
    expect(result.current.remaining).toBe(2);
  });
});
